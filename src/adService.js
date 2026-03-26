// ==========================================
// AD NETWORK PROMISES
// ==========================================

const playAdsgram = () => {
  return new Promise((resolve, reject) => {
    // 1. Check if the SDK loaded from index.html
    if (!window.Adsgram) {
      reject("Adsgram SDK not found");
      return;
    }

    // 2. Initialize your specific ad block
    // REPLACE 'YOUR_BLOCK_ID' with the ID from your Adsgram dashboard
    const adController = window.Adsgram.init({ blockId: "25928" });

    // 3. Show the ad and wait for the result
    adController.show()
      .then((result) => {
        // Player watched the ad to completion
        resolve(result); 
      })
      .catch((error) => {
        // Player skipped, closed, or ad failed to load
        reject(error); 
      });
  });
};

const playMonetag = () => {
  return new Promise((resolve, reject) => {
    // Monetag and Adsterra inside Telegram often work best as Direct Links (SmartLinks)
    // because Telegram sometimes blocks heavy 3rd-party scripts in the sandbox.
    // If you have a Monetag direct link, you can open it like this:
    // window.open('YOUR_MONETAG_DIRECT_LINK', '_blank');
    // resolve(); 
    
    // For now, we simulate a failure to force it down the waterfall if not set up
    reject("Monetag not configured yet");
  });
};

const playAdsterra = () => {
  return new Promise((resolve, reject) => {
    // Same as Monetag - insert Adsterra logic/Direct Link here
    reject("Adsterra not configured yet");
  });
};

// ==========================================
// THE WATERFALL EXECUTION
// ==========================================

export const showRewardedAdWaterfall = async () => {
  console.log("🌊 Starting Ad Waterfall...");

  try {
    console.log("1️⃣ Requesting Adsgram...");
    await playAdsgram();
    return { success: true, network: 'Adsgram' };

  } catch (err1) {
    console.log("⚠️ Adsgram skipped or no fill:", err1);

    try {
      console.log("2️⃣ Falling back to Monetag...");
      await playMonetag();
      return { success: true, network: 'Monetag' };

    } catch (err2) {
      console.log("⚠️ Monetag skipped or no fill:", err2);

      try {
        console.log("3️⃣ Falling back to Adsterra...");
        await playAdsterra();
        return { success: true, network: 'Adsterra' };

      } catch (err3) {
        console.log("❌ All ad networks failed or were skipped.");
        return { success: false, error: "No ads currently available." };
      }
    }
  }
};