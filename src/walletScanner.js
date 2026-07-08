// src/walletScanner.js

export const scanWalletForGear = async (walletAddress) => {
  console.log(`🔍 Scanning wallet ${walletAddress} for Gift2u Gear...`);

  // We use a public RPC that supports the DAS API (Helius is standard for this)
  // Note: For production, you will want to get a free API key from Helius.dev or QuickNode
  const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY"; 

  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'gift-scanner',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100, // Scans the first 100 NFTs they own
          displayOptions: {
            showCollectionMetadata: true,
          },
        },
      }),
    });

    const data = await response.json();
    
    if (!data.result || !data.result.items) {
      console.log("No assets found in wallet.");
      return { bonusTapPower: 0, bonusMaxEnergy: 0, hasAutoBot: false };
    }

    // Initialize the bonuses at zero
    let bonusTapPower = 0;
    let bonusMaxEnergy = 0;
    let hasAutoBot = false;

    // The unique ID of your specific NFT Collection (You will generate this when you mint the items!)
    const GIFT_COLLECTION_ADDRESS = "YOUR_FUTURE_NFT_COLLECTION_ADDRESS_HERE";

    // Loop through their NFTs and check if any belong to your game
    data.result.items.forEach((nft) => {
      
      // Check if the NFT belongs to the Gift2u collection
      const isGiftGear = nft.grouping?.some(
        group => group.group_key === 'collection' && group.group_value === GIFT_COLLECTION_ADDRESS
      );

      if (isGiftGear) {
        console.log(`✅ Found Gift2u Item: ${nft.content.metadata.name}`);

        // Read the item's name or attributes to apply the correct boost
        const itemName = nft.content.metadata.name.toLowerCase();

        if (itemName.includes("glove") || itemName.includes("tapper")) {
          bonusTapPower += 5; // Adds +5 to their tap power
        }
        
        if (itemName.includes("core") || itemName.includes("battery")) {
          bonusMaxEnergy += 2000; // Adds 2000 to their energy limit
        }

        if (itemName.includes("bot") || itemName.includes("drone")) {
          hasAutoBot = true; // Unlocks passive tapping
        }
      }
    });

    console.log("📊 Scan Complete. Total Bonuses:", { bonusTapPower, bonusMaxEnergy, hasAutoBot });
    
    return { bonusTapPower, bonusMaxEnergy, hasAutoBot };

  } catch (error) {
    console.error("❌ Error scanning wallet:", error);
    // If the scan fails, don't break the game, just return 0 bonuses
    return { bonusTapPower: 0, bonusMaxEnergy: 0, hasAutoBot: false }; 
  }
};