#!/usr/bin/env python3
from pathlib import Path
import re

def fix_file(path: Path):
    text = path.read_text()
    original = text

    # restore block
    old_restore = '''      if (!bip39.validateMnemonic(cleaned)) {
        alert("Invalid secret phrase. Check the words and try again.");
        return false;
      }
      const seedBuffer = bip39.mnemonicToSeedSync(cleaned);
      const seedHex = Array.from(seedBuffer).map((b) => b.toString(16).padStart(2, "0")).join("");
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seedHex).key;
      const keypair = Keypair.fromSeed(derivedSeed);
      const publicKey = keypair.publicKey.toBase58();'''

    new_restore = '''      let keypair;
      try {
        keypair = keypairFromMnemonic(cleaned);
      } catch {
        alert("Invalid secret phrase. Check the words and try again.");
        return false;
      }
      const publicKey = keypair.publicKey.toBase58();'''

    if old_restore in text:
        text = text.replace(old_restore, new_restore)
        print(path, "restore fixed")
    else:
        print(path, "restore not found")

    # Pattern: seed.toString('hex')
    pat_a = re.compile(
        r"const seed = bip39\.mnemonicToSeedSync\(([^)]+)\);\s*"
        r"const derivedSeed = derivePath\(\"m/44'/501'/0'/0'\", seed\.toString\('hex'\)\)\.key;\s*"
        r"const (\w+) = Keypair\.fromSeed\(derivedSeed\);",
        re.M,
    )
    text, n = pat_a.subn(r"const \2 = keypairFromMnemonic(\1);", text)
    print(path, "pat_a", n)

    # Pattern: seedHex Array.from
    pat_b = re.compile(
        r"const seed = bip39\.mnemonicToSeedSync\(([^)]+)\);\s*"
        r"const seedHex = Array\.from\(seed\)\s*\.map\([^\)]+\)\s*\.join\(''\);\s*"
        r"const derivedSeed = derivePath\(\"m/44'/501'/0'/0'\", seedHex\)\.key;\s*"
        r"(?:const |let )?(\w+)\s*=\s*Keypair\.fromSeed\(derivedSeed\);",
        re.M,
    )
    text, n = pat_b.subn(r"const \2 = keypairFromMnemonic(\1);", text)
    print(path, "pat_b", n)

    # Multiline Array.from with separate lines
    pat_c = re.compile(
        r"const seed = bip39\.mnemonicToSeedSync\(([^)]+)\);\s*"
        r"const seedHex = Array\.from\(seed\)\s*\n\s*\.map\([^\n]+\n\s*\.join\(''\);\s*\n\s*"
        r"const derivedSeed = derivePath\(\"m/44'/501'/0'/0'\", seedHex\)\.key;\s*\n\s*"
        r"(?:const |let )?(\w+)\s*=\s*Keypair\.fromSeed\(derivedSeed\);",
        re.M,
    )
    text, n = pat_c.subn(r"const \2 = keypairFromMnemonic(\1);", text)
    print(path, "pat_c", n)

    left = [(i + 1, line.strip()) for i, line in enumerate(text.splitlines()) if "derivePath" in line]
    print(path, "remaining derivePath:", left)

    if text != original:
        path.write_text(text)
        print(path, "written")
    else:
        print(path, "unchanged")


fix_file(Path("/home/tower/gift_memecoin/src/GiftTap.jsx"))
fix_file(Path("/home/tower/gift_memecoin/src/Marketplace.jsx"))
