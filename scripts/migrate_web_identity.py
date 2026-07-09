#!/usr/bin/env python3
"""One-shot helper: convert GiftTap.jsx Telegram identity to web identity."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "GiftTap.jsx"
text = path.read_text()

if "playerIdentity" not in text:
    text = text.replace(
        "import CryptoJS from 'crypto-js';\nimport { motion, AnimatePresence } from 'framer-motion';",
        "import CryptoJS from 'crypto-js';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport {\n  getPlayerProfile,\n  setPlayerId,\n  setUsername,\n  captureReferralFromUrl,\n  consumeReferralId,\n  getInviteLink,\n  vaultSaltFor,\n} from './playerIdentity';",
    )
    print("added playerIdentity import")
else:
    print("import already present")

old_cloud = """const saveToCloud = (key, value) => {
  return new Promise((resolve, reject) => {
    const tg = window.Telegram?.WebApp;
    // Strictly verify version 6.9+ before attempting CloudStorage
    if (tg?.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
      tg.CloudStorage.setItem(key, value, (err, success) => {
        if (err) reject(err); else resolve(success);
      });
    } else {
      // Safe fallback for older devices
      localStorage.setItem(key, value); 
      resolve(true);
    }
  });
};

const getFromCloud = (key) => {
  return new Promise((resolve, reject) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
      tg.CloudStorage.getItem(key, (err, value) => {
        if (err) reject(err); else resolve(value || "");
      });
    } else {
      resolve(localStorage.getItem(key) || "");
    }
  });
};

const removeFromCloud = (key) => {
  return new Promise((resolve, reject) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
      tg.CloudStorage.removeItem(key, (err, success) => {
        if (err) reject(err); else resolve(success);
      });
    } else {
      localStorage.removeItem(key); 
      resolve(true);
    }
  });
};"""

new_cloud = """const saveToCloud = (key, value) => {
  return new Promise((resolve) => {
    localStorage.setItem(key, value);
    resolve(true);
  });
};

const getFromCloud = (key) => {
  return new Promise((resolve) => {
    resolve(localStorage.getItem(key) || "");
  });
};

const removeFromCloud = (key) => {
  return new Promise((resolve) => {
    localStorage.removeItem(key);
    resolve(true);
  });
};"""

if old_cloud in text:
    text = text.replace(old_cloud, new_cloud)
    print("cloud helpers replaced")
else:
    print("cloud helpers NOT found exact — check manually")

old_tg = """  const tgUser = useMemo(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { id: "test_local_user", first_name: "Local" };
  }, []);"""

new_tg = """  // Web player identity (local UUID session). TG migrants restore via 12-word phrase.
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const tgUser = player; // alias keeps call sites working during transition"""

if old_tg in text:
    text = text.replace(old_tg, new_tg)
    print("tgUser bootstrap replaced")
else:
    print("tgUser bootstrap NOT found")

text = text.replace(
    "const referrerId = window.Telegram?.WebApp?.initDataUnsafe?.start_param || null;",
    "const referrerId = consumeReferralId();",
)

replacements = [
    (
        "Your wallet is securely tied to your Telegram, but you must save these 12 words now. You will need them if you ever want to use external apps like Phantom.",
        "This wallet is yours alone. Save these 12 words now — they are the only way to restore your account on a new device or browser. Never share them.",
    ),
    (
        "Your wallet is securely locked to your Telegram account.",
        "Your wallet is stored only on this device until you back up the 12-word phrase. Gift Tap never keeps your seed.",
    ),
    (
        "No matching telegram_id found for",
        "No matching player found for",
    ),
]

for a, b in replacements:
    if a in text:
        text = text.replace(a, b)
        print("string ok:", a[:48])
    else:
        print("string missing:", a[:48])

# Allow saves for all real player IDs (no more test_local_user block as default)
# Keep guards that skip empty id only — update test_local_user checks to allow web UUIDs
# (test_local_user will no longer be assigned)

text = text.replace(
    "username: tgUser.username || tgUser.first_name,",
    "username: player.username || player.first_name || 'Player',",
)

path.write_text(text)
print("wrote", path, "chars", len(text))
