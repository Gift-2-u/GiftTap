#!/usr/bin/env python3
"""Finish wiring playerIdentity into GiftTap.jsx."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "GiftTap.jsx"
text = path.read_text()

# --- 1) Identity block: drop tgUser alias, use player only ---
old_id = """  // Web player identity (local UUID session). TG migrants restore via 12-word phrase.
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const tgUser = player; // alias keeps call sites working during transition"""

new_id = """  // Web player identity (local UUID session). TG migrants restore via 12-word phrase.
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const playerId = String(player.id);"""

if old_id in text:
    text = text.replace(old_id, new_id)
    print("identity block updated")
else:
    print("WARN: identity block not found")

# --- 2) Global renames for call sites (careful order) ---
# tgUser.id -> playerId, tgUser?.id -> playerId, tgUser -> player (remaining)
# Do specific first
replacements = [
    ("String(tgUser.id)", "playerId"),
    ("tgUser?.id", "playerId"),
    ("tgUser.id", "playerId"),
    ("`wallet_secret_${tgUser.id}`", "`wallet_secret_${playerId}`"),
    ("`wallet_pwd_${tgUser.id}`", "`wallet_pwd_${playerId}`"),
    ("`wallet_backed_up_${tgUser.id}`", "`wallet_backed_up_${playerId}`"),
    ("`main-page-sync-${tgUser.id}`", "`main-page-sync-${playerId}`"),
    ("telegramId={tgUser?.id}", "playerId={playerId}"),
    ("telegramId={playerId}", "playerId={playerId}"),  # noop if already
    ("tgUser={tgUser}", "player={player}"),
    ("tgUser={player}", "player={player}"),
]

for a, b in replacements:
    c = text.count(a)
    if c:
        text = text.replace(a, b)
        print(f"replace {c}x: {a[:50]} -> {b[:50]}")

# Remaining tgUser.username / first_name
text = text.replace("tgUser.username || tgUser.first_name || 'Player'", "player.username || player.first_name || 'Player'")
text = text.replace("tgUser.username || tgUser.first_name", "player.username || player.first_name || 'Player'")

# Any leftover tgUser references
leftover = [i + 1 for i, line in enumerate(text.splitlines()) if "tgUser" in line]
if leftover:
    print("leftover tgUser lines:", leftover[:30])
    # Last resort: tgUser -> player for remaining (should be few)
    text2 = text.replace("tgUser", "player")
    # avoid double player.player if any
    text = text2
    print("force-replaced remaining tgUser -> player")

# --- 3) Use vaultSaltFor instead of raw template strings ---
text = text.replace(
    "const invisibleKey = `${userId}_GIFT_memecoin_secure_salt_2026`;",
    "const invisibleKey = vaultSaltFor(userId);",
)
text = text.replace(
    "const invisibleKey = `${userId}_GIFT_memecoin_secure_salt_2026`; ",
    "const invisibleKey = vaultSaltFor(userId); ",
)
text = text.replace(
    "const invisibleKey = `${playerId}_GIFT_memecoin_secure_salt_2026`;",
    "const invisibleKey = vaultSaltFor(playerId);",
)
# pattern with tgUser already renamed might be playerId
import re
text = re.sub(
    r"const invisibleKey = `\$\{([^}]+)\}_GIFT_memecoin_secure_salt_2026`;",
    r"const invisibleKey = vaultSaltFor(\1);",
    text,
)
print("vaultSaltFor applied")

# --- 4) syncPlayer: use playerId, rename DB row to avoid shadowing identity `player` ---
# This is the biggest structural fix inside syncPlayer callback
old_sync_start = """  const syncPlayer = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = String(playerId);
      const invisibleKey = vaultSaltFor(userId);
      
      // 1. Fetch player data
      const { data: player } = await supabase
        .from('players')
        .select('*')
        .eq('telegram_id', userId)
        .maybeSingle();"""

# After renames, playerId might already be used without String()
# Find actual syncPlayer start
m = re.search(
    r"  const syncPlayer = useCallback\(async \(\) => \{\n    setIsLoading\(true\);\n    try \{\n      const userId = String\((?:playerId|player\.id)\);\n      const invisibleKey = vaultSaltFor\(userId\);",
    text,
)
if not m:
    # try older form
    m = re.search(
        r"  const syncPlayer = useCallback\(async \(\) => \{\n    setIsLoading\(true\);\n    try \{\n      const userId = String\([^)]+\);\n      const invisibleKey = [^;]+;",
        text,
    )
print("syncPlayer match:", bool(m))

# Replace `const { data: player }` in syncPlayer with playerRow - only first occurrence after syncPlayer
idx = text.find("const syncPlayer = useCallback")
if idx != -1:
    # only within syncPlayer function - until initializeNewPlayer
    end = text.find("const initializeNewPlayer", idx)
    chunk = text[idx:end]
    chunk2 = chunk.replace("const { data: player } = await supabase", "const { data: playerRow } = await supabase", 1)
    # Replace player. with playerRow. for DB fields - careful not to replace setPlayer
    # Within this chunk, `player` is the DB row after the destructure
    # Patterns: player &&, player., !player
    # Don't replace setPlayer, playerId, playerRow, player.username from identity - identity uses playerId in this function as userId
    
    # After renaming data: player -> playerRow, replace remaining `player` DB references
    # Strategy: replace common DB access patterns
    db_patterns = [
        ("if (player && player.wallet_address)", "if (playerRow && playerRow.wallet_address)"),
        ("else if (!player)", "else if (!playerRow)"),
        ("player.has_beta_access", "playerRow.has_beta_access"),
        ("player.wallet_address", "playerRow.wallet_address"),
        ("player.sol_balance", "playerRow.sol_balance"),
        ("player.gft_token_balance", "playerRow.gft_token_balance"),
        ("player.shard_balance", "playerRow.shard_balance"),
        ("player.usdc_balance", "playerRow.usdc_balance"),
        ("player.tap_power", "playerRow.tap_power"),
        ("player.max_daily_limit", "playerRow.max_daily_limit"),
        ("player.inventory", "playerRow.inventory"),
        ("player.frenzy_expires", "playerRow.frenzy_expires"),
        ("player.efficiency_expires", "playerRow.efficiency_expires"),
        ("player.energy_boost_expires", "playerRow.energy_boost_expires"),
        ("player.premium_multiplier", "playerRow.premium_multiplier"),
        ("player.premium_multiplier_expires", "playerRow.premium_multiplier_expires"),
        ("player.limit_boost_amount", "playerRow.limit_boost_amount"),
        ("player.limit_boost_expires", "playerRow.limit_boost_expires"),
        ("player.lifetime_taps", "playerRow.lifetime_taps"),
        ("player.season_shards", "playerRow.season_shards"),
        ("player.max_unlocked_level", "playerRow.max_unlocked_level"),
        ("player.last_energy", "playerRow.last_energy"),
        ("player.last_tap_date", "playerRow.last_tap_date"),
        ("player.current_streak", "playerRow.current_streak"),
        ("player.daily_taps", "playerRow.daily_taps"),
        ("player.last_ad_date", "playerRow.last_ad_date"),
        ("player.daily_ads_watched", "playerRow.daily_ads_watched"),
        ("player.last_updated", "playerRow.last_updated"),
        ("player.bot_expires", "playerRow.bot_expires"),
        ("player.encrypted_vault", "playerRow.encrypted_vault"),
        ("Number(player.", "Number(playerRow."),
    ]
    for a, b in db_patterns:
        chunk2 = chunk2.replace(a, b)
    text = text[:idx] + chunk2 + text[end:]
    print("syncPlayer DB row renamed to playerRow")

# --- 5) Remove test_local_user blocks that prevent web saves ---
text = text.replace(
    'if (!userId || userId === "test_local_user") return;',
    "if (!userId) return;",
)
text = text.replace(
    'if (!playerId || playerId === "test_local_user") return;',
    "if (!playerId) return;",
)
text = text.replace(
    'if (!isDataLoaded || !playerId || playerId === "test_local_user") return;',
    "if (!isDataLoaded || !playerId) return;",
)
# saveToDatabase guard variants
text = re.sub(
    r'if \(!playerId \|\| playerId === "test_local_user"\) return;',
    "if (!playerId) return;",
    text,
)
text = re.sub(
    r'if \(!player\?\.id \|\| player\.id === "test_local_user"\) return;',
    "if (!playerId) return;",
    text,
)

# --- 6) syncPlayer dependency array ---
text = text.replace(
    "}, [tgUser, fetchTopLeader]);",
    "}, [playerId, player.username, player.first_name, fetchTopLeader]);",
)
text = text.replace(
    "}, [player, fetchTopLeader]);",
    "}, [playerId, player.username, player.first_name, fetchTopLeader]);",
)
# if already playerId only:
if "}, [playerId, fetchTopLeader]);" in text:
    text = text.replace(
        "}, [playerId, fetchTopLeader]);",
        "}, [playerId, player.username, player.first_name, fetchTopLeader]);",
    )

text = text.replace("}, [playerId]);", "}, [playerId]);")  # streak effect ok
text = text.replace(
    "  }, [isDataLoaded, playerId]);",
    "  }, [isDataLoaded, playerId]);",
)
text = text.replace(
    "  }, [playerWallet, connection, balance, playerId]); // Added 'balance' to dependencies",
    "  }, [playerWallet, connection, balance, playerId]);",
)

# --- 7) BetaGate prop: also accept playerId in component later; GiftTap already set ---
# Fix username in saveToDatabase if broken
text = text.replace(
    "username: player.username || player.first_name || 'Player',",
    "username: player.username || player.first_name || 'Player',",
)

# --- 8) Add restoreAccount helper after initializeNewPlayer ---
restore_fn = '''
  /** Restore a Telegram / other-device account via 12-word phrase → wallet_address lookup. */
  const restoreAccountFromMnemonic = async (mnemonic) => {
    const cleaned = (mnemonic || "").trim().toLowerCase().replace(/\\s+/g, " ");
    if (!cleaned || cleaned.split(" ").length < 12) {
      alert("Enter your full 12-word secret phrase.");
      return false;
    }
    setIsLoading(true);
    try {
      if (!bip39.validateMnemonic(cleaned)) {
        alert("Invalid secret phrase. Check the words and try again.");
        return false;
      }
      const seedBuffer = bip39.mnemonicToSeedSync(cleaned);
      const seedHex = Array.from(seedBuffer).map((b) => b.toString(16).padStart(2, "0")).join("");
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seedHex).key;
      const keypair = Keypair.fromSeed(derivedSeed);
      const publicKey = keypair.publicKey.toBase58();

      const { data: row, error } = await supabase
        .from("players")
        .select("*")
        .eq("wallet_address", publicKey)
        .maybeSingle();

      if (error) throw error;
      if (!row) {
        alert("No Gift Tap account found for this phrase. You can create a new account instead.");
        return false;
      }

      // Bind this browser to the existing player key (legacy telegram_id column)
      setPlayerId(String(row.telegram_id));
      if (row.username) setUsername(row.username);
      setPlayer(getPlayerProfile());

      const invisibleKey = vaultSaltFor(String(row.telegram_id));
      const encryptedVault = encryptWallet(cleaned, invisibleKey);
      await supabase
        .from("players")
        .update({ encrypted_vault: encryptedVault })
        .eq("telegram_id", String(row.telegram_id));

      setDecryptedPhrase(cleaned);
      setPlayerWallet(publicKey);
      setHasAccess(!!row.has_beta_access);
      alert("Account restored! Loading your progress...");
      // syncPlayer will re-run via playerId change
      return true;
    } catch (err) {
      console.error("Restore failed:", err);
      alert(`Restore failed: ${err.message || err}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

'''

if "restoreAccountFromMnemonic" not in text:
    marker = "  // 5. EFFECTS\n  useEffect(() => { syncPlayer(); }, [syncPlayer]);"
    if marker in text:
        text = text.replace(marker, restore_fn + "\n" + marker)
        print("added restoreAccountFromMnemonic")
    else:
        print("WARN: could not insert restore fn")
else:
    print("restore fn already present")

# --- 9) Pass restore to BetaGate ---
old_beta = """        <BetaGate 
          playerId={playerId} 
          onAccessGranted={(code) => initializeNewPlayer(code)} 
        />"""
new_beta = """        <BetaGate 
          playerId={playerId} 
          onAccessGranted={(code) => initializeNewPlayer(code)}
          onRestoreAccount={restoreAccountFromMnemonic}
        />"""
if old_beta in text:
    text = text.replace(old_beta, new_beta)
    print("BetaGate props updated")
else:
    # try telegramId variant leftover
    old_beta2 = """        <BetaGate 
          telegramId={playerId} 
          onAccessGranted={(code) => initializeNewPlayer(code)} 
        />"""
    if old_beta2 in text:
        text = text.replace(old_beta2, new_beta)
        print("BetaGate props updated from telegramId")
    else:
        print("WARN: BetaGate block not found")

# --- 10) Fix double-String if any ---
text = text.replace("String(playerId)", "playerId")
text = text.replace("String(playerId)", "playerId")  # idempotent

# verify no tgUser
if "tgUser" in text:
    print("STILL HAS tgUser:", [i+1 for i,l in enumerate(text.splitlines()) if "tgUser" in l][:20])
else:
    print("no tgUser left")

path.write_text(text)
print("wrote", path, "lines", text.count(chr(10))+1)
