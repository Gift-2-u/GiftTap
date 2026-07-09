#!/usr/bin/env python3
"""Clarify legacy telegram_id DB column usage in GiftTap.jsx + move identity early."""
from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / "src" / "GiftTap.jsx"
text = path.read_text()

# Update import
old_imp = """import {
  getPlayerProfile,
  setPlayerId,
  setUsername,
  captureReferralFromUrl,
  consumeReferralId,
  getInviteLink,
  vaultSaltFor,
} from './playerIdentity';"""

new_imp = """import {
  getPlayerProfile,
  setPlayerId,
  setUsername,
  captureReferralFromUrl,
  consumeReferralId,
  getInviteLink,
  vaultSaltFor,
  DB_PLAYER_ID,
} from './playerIdentity';
// DB_PLAYER_ID === 'telegram_id' (legacy Supabase column — still the player primary key)"""

if old_imp in text:
    text = text.replace(old_imp, new_imp)
    print("import updated")
else:
    print("import block not found")

# Move identity block right after GiftTapGame styles start / after first state batch
# Currently identity is mid-file. Insert early after component opens styles.

identity_block = """  // Web player identity FIRST (local UUID). Never Telegram WebApp.
  // DB still stores this under column telegram_id (see DB_PLAYER_ID).
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const playerId = String(player.id);

"""

# Remove existing identity block if present
old_identity = """  // Web player identity (local UUID session). TG migrants restore via 12-word phrase.
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const playerId = String(player.id);

"""
if old_identity in text:
    text = text.replace(old_identity, "")
    print("removed mid-file identity block")

# Insert after: const GiftTapGame = () => {\n\n  const styles = {
marker = "const GiftTapGame = () => {\n\n  const styles = {"
if marker in text and "const playerId = String(player.id);" not in text.split("const styles")[0]:
    # Put identity AFTER styles object ends - easier: after "// 1. GAME STATE"
    game_state = "  // 1. GAME STATE\n"
    if game_state in text and identity_block.strip() not in text:
        text = text.replace(game_state, identity_block + game_state, 1)
        print("inserted identity at GAME STATE")
    else:
        print("could not insert at GAME STATE")
elif "const playerId = String(player.id);" in text:
    print("playerId already present somewhere")
else:
    # re-add if we removed but failed insert
    if "const playerId = String(player.id);" not in text:
        game_state = "  // 1. GAME STATE\n"
        text = text.replace(game_state, identity_block + game_state, 1)
        print("re-inserted identity")

# Replace query/update patterns
replacements = [
    (".eq('telegram_id', ", f".eq(DB_PLAYER_ID, "),
    ('.eq("telegram_id", ', ".eq(DB_PLAYER_ID, "),
    (".eq(`telegram_id`, ", ".eq(DB_PLAYER_ID, "),
    ("onConflict: 'telegram_id'", "onConflict: DB_PLAYER_ID"),
    ("onConflict: \"telegram_id\"", "onConflict: DB_PLAYER_ID"),
    (".select('telegram_id')", f".select(DB_PLAYER_ID)"),
    ("telegram_id: userId", "[DB_PLAYER_ID]: userId"),
    ("telegram_id: playerId", "[DB_PLAYER_ID]: playerId"),
    ("payload.new.telegram_id", "payload.new[DB_PLAYER_ID]"),
    ("row.telegram_id", f"row[DB_PLAYER_ID]"),
    ("data.telegram_id", "data[DB_PLAYER_ID]"),
]

for a, b in replacements:
    c = text.count(a)
    if c:
        text = text.replace(a, b)
        print(f"{c}x {a} -> {b}")

# Fix double brackets if any
text = text.replace("row[[DB_PLAYER_ID]]", "row[DB_PLAYER_ID]")
text = text.replace("data[[DB_PLAYER_ID]]", "data[DB_PLAYER_ID]")
text = text.replace("payload.new[[DB_PLAYER_ID]]", "payload.new[DB_PLAYER_ID]")

# Edge function body still expects telegram_id key in JSON (API contract)
# Revert body fields that should stay as API field name:
text = text.replace(
    "body: JSON.stringify({ [DB_PLAYER_ID]: userId, username: userName })",
    "body: JSON.stringify({ telegram_id: userId, username: userName })  // edge fn arg name (player key value)",
)
text = text.replace(
    """body: JSON.stringify({ 
            [DB_PLAYER_ID]: userId,
            username: player.username || player.first_name || 'Player'
          })""",
    """body: JSON.stringify({ 
            telegram_id: userId, // edge fn arg — value is web playerId, not TG
            username: player.username || player.first_name || 'Player'
          })""",
)

# Count remaining bare telegram_id
left = [(i + 1, line.strip()) for i, line in enumerate(text.splitlines()) if "telegram_id" in line]
print("remaining telegram_id lines:", len(left))
for ln, line in left[:25]:
    print(f"  {ln}: {line[:100]}")

# Ensure playerId exists once
count_player = text.count("const playerId = String(player.id);")
print("playerId decls:", count_player)
if count_player == 0:
    print("ERROR: no playerId!")
if count_player > 1:
    # remove duplicates carefully - keep first
    parts = text.split("const playerId = String(player.id);")
    text = parts[0] + "const playerId = String(player.id);" + "".join(
        p.replace(
            "  const [player, setPlayer] = useState(() => {\n    captureReferralFromUrl();\n    return getPlayerProfile();\n  });\n  ",
            "",
            1,
        ) if "getPlayerProfile" in p[:200] else p
        for p in parts[1:]
    )
    # simpler: just leave and warn
    print("WARN multiple playerId")

path.write_text(text)
print("done")
