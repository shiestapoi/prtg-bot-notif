-- Prevent duplicate PRTG configs from sending the same request URL more than once.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PrtgConfig"
    GROUP BY "requestUrl"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique index: duplicate PrtgConfig.requestUrl values already exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX "PrtgConfig_requestUrl_key" ON "PrtgConfig"("requestUrl");
