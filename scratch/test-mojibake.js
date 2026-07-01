const fs = require('fs');
const testStr = 'ðŸ”§ *[${label}]* â€” Notifikasi monitoring dinonaktifkan\nâ” â” â” \nâš ï¸ ';
const recovered1 = Buffer.from(testStr, 'latin1').toString('utf8');
const iconv = require('iconv-lite'); // Is iconv-lite available? Probably not by default, but let's try.
console.log('Latin1 -> UTF8:', recovered1);
