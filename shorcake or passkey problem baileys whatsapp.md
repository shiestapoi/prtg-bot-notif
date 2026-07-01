## Root cause of the new passkey linking failure: it's the official web client's "Shortcake" flow

I reconstructed what the server is actually asking for, by pairing a **whatsmeow-side websocket capture** with the **deobfuscated `web.whatsapp.com` source** (the passkey companion-linking flow is codenamed **"Shortcake"** internally). This answers the open questions directly.

### TL;DR answers

- **Is WebAuthn required?** — **YES.** *(Observed)* The official client runs `navigator.credentials.get()` with `rpId: "whatsapp.com"` and `userVerification: "required"`. This is a real W3C WebAuthn assertion ceremony.
- **Are there new binary nodes?** — **YES.** *(Observed)* A new inbound `<notification type="passkey_prologue_request">`, plus two new IQ RPCs going back: **GetRef** and **SetPasskeyPrologue**.
- **Is the exchange outside the websocket?** — **Mostly NO.** *(Inferred)* The prologue RPCs look like SMAX IQ nodes over the **noise-encrypted websocket** (same channel the server uses to *deliver* the prologue request). The only genuinely out-of-band part is the **WebAuthn ceremony itself**, and possibly a separate handoff/integrity HTTPS upload (which is where the `Graph (#403) "Upload is forbidden"` most plausibly sits — *not* the assertion submission).

---

### What the server sends (DIRECTLY OBSERVED — whatsmeow capture)

After companion registration completes — and this happens on **both** linking paths:
- the QR path (`<pair-device><ref>…</ref>`), and
- the pair-code path (`link_code_companion_reg`: `companion_hello → primary_hello → companion_finish`),

…the server accepts registration with `<iq type="result"/>` **and then pushes**:

```xml
<notification type="passkey_prologue_request">
  <passkey_request_options>
    {"challenge":"<b64url>","timeout":600000,"rpId":"whatsapp.com",
     "allowCredentials":[],"userVerification":"required","extensions":{"uvm":true}}
  </passkey_request_options>
</notification>
```

That JSON is a textbook **WebAuthn `PublicKeyCredentialRequestOptions`** (an assertion request). whatsmeow currently logs `Unhandled notification with type passkey_prologue_request`, sends a bare `<ack>`, never receives `<success>`, and times out. **That is the failure.** *(Observed)*

---

### What the official client does with it (DIRECTLY OBSERVED — source map)

The pipeline, module-by-module:

| Step | Module / RPC | What it does |
|------|--------------|--------------|
| 1 | `WAWebShortcakeLinkingPairingRequest` | Builds the CompanionReg `PairingRequest` from existing crypto: `waNoiseInfo` (UserPrefsInfoStore), `getRegistrationInfo` (SignalStore), `getADVSecretKey` (AdvSignatureApi) → `encodeProtobuf(CompanionReg)`. **Not new crypto.** *(Observed)* |
| 2 | (existing companion reg) | Normal registration completes first — QR **or** pair-code — server replies `<iq type=result/>`. *(Observed)* |
| 3 | server → `passkey_prologue_request` | The notification above. *(Observed)* |
| 4 | `WAWebShortcakeLinkingRequestOptionsCache` | Caches the request options (TTL 600s — matches gk `request_options_ttl_seconds=600`). *(Observed config; bridge to step 3 inferred)* |
| 5 | `WAWebShortcakeLinkingPasskeyPrologue` | `self.navigator.credentials` (else throws *"WebAuthn not available"*); JSON-parses options; verifies `challenge` via `WABase64.decodeB64UrlSafe`; runs ceremony; requires credential `type === "public-key"`; builds `{id, rawId: encodeB64UrlSafe(...), response…}`. *(Observed)* |
| 6 | `WASmaxMdGetRefRPC.sendGetRefRPC()` | Fetches a `CompanionRef`; expects `name === "GetRefResponseSuccess"`, else throws **"GetRef IQ failed"** (the error string itself says *IQ*). *(Observed)* |
| 7 | `WASmaxMdSetPasskeyPrologueRPC` | Submits `assertionJson` + credential. Fires `triggerShortcakePrologueSent` (`link_device_events:shortcake_prologue_sent`) and `triggerShortcakeVerificationCodeReady`. *(Observed)* |
| 8 | `WAWebShortcakeCodeMatching.react` | Displays a verification code (testIds `shortcake_verification_code_display`, `shortcake_code_matching_card`, confirm button `shortcake_code_confirm_button`). Failure → `sendLogs("shortcake-code-confirm-fail")`. This is the human cross-device code-match users see. *(Observed)* |

Supporting evidence *(all Observed)*:
- **Codename + gatekeepers:** `shortcake_companion_prologue__passkeys__enabled = true` (gk 29206), `__handoff_enabled = true` (gk 29204), `assertion_timeout_seconds = 600`, `request_options_ttl_seconds = 600`.
- **First-class pairing type:** `PairingType` enum now includes both `ALT_DEVICE_LINKING` and `SHORTCAKE_PASSKEY` — passkey linking is **layered after** existing companion registration, not a replacement.
- **Error/event surface:** `triggerShortcakeError` (`link_device_events:shortcake_error`); the runtime console also surfaced a captured **timeout** string: `"Shortcake UI: error - timeout (shortcake-passkey-error)"`.

---

### Reconciling the channel (INFERRED)

The `WASmaxMd*` modules are the SMAX strongly-typed Multi-Device IQ RPC layer over the noise socket. Three things point to **websocket, not Graph/HTTPS**, for GetRef and SetPasskeyPrologue:
1. The GetRef error literally says *"GetRef IQ failed"*.
2. The server delivers the prologue request as a websocket `<notification>`, so the natural reply channel is the same socket.
3. SMAX is WhatsApp Web's IQ-over-socket convention.

So the previously-seen **`Graph (#403) "Upload is forbidden"` is most plausibly NOT the assertion submission.** The two leading candidates for that out-of-band HTTPS upload are: the **handoff** path (`handoff_enabled` gk 29204 + module `WAWebShortcakeLinkingHandoffProof`, i.e. a cross-device proof handoff), or a **separate integrity/attestation upload** (cf. `show_integrity_screensharing_friction_ui` gk 16411) performed *around* the ceremony. *(Inferred)*

> Additional client-side modules that complete the picture exist in public bundle mirrors but were **not** in my own capture, so I mark them inferred-by-third-party-source: `WAWebShortcakeLinkingHandlePasskeyPrologueRequest` (the handler for the server notification), `WAWebShortcakeLinkingIq` (a `GetPasskeyRequestOptions` / `SetCompanionNonce` / `SetEncryptedPairingRequest` IQ trio), and `WAWebShortcakeLinkingAlgorithm` (Curve25519 + HKDF with info-string `"Companion Pairing {n} with ref {r}"`, then AES-GCM over the pairing request). *(Observed in third-party mirror, not in my capture)*

---

### Feasibility for headless libraries

**Implementable on the websocket today:**
- Handle inbound `passkey_prologue_request` instead of acking-and-dropping it.
- Implement the GetRef IQ and the SetPasskeyPrologue IQ (carry the assertion + ref).
- Implement the verification-code-matching exchange.

**The hard blocker — the WebAuthn assertion:**
The server demands `userVerification:"required"` against `rpId:"whatsapp.com"`. The official client satisfies this with `navigator.credentials.get()` backed by a real authenticator holding a credential **registered under rpId `whatsapp.com`**. A headless client has no such authenticator and no such credential, so it cannot produce a valid signed assertion over the server challenge. Forging one outside a browser is only possible if the account *already* has a provisioned passkey whose private key is accessible — which is not true for a fresh companion link.

**Open question that decides everything** *(Inferred)*: whether the server still accepts the legacy ADV/companion-registration completion for some accounts (which would suggest a gated/half-shipped rollout — the captured *timeout* failure mode inside the official client is weakly consistent with this, though not proof of it), or whether passkey is now **mandatory** for affected accounts. If mandatory, headless linking for those accounts is blocked until a passkey can be provisioned, regardless of how faithfully the IQ nodes are implemented.

---

*Legend: **(Observed)** = directly captured from the websocket trace or the deobfuscated official client source. **(Inferred)** = reasoned from those observations. Test identifiers and account identifiers redacted.*