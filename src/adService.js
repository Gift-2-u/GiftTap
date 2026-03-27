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
    const adController = window.Adsgram.init({ blockId: "25133" });

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
    // SECURITY CHECK: Verify Monetag actually loaded successfully
    if (typeof show_10791512 !== 'function') {
      console.warn("⚠️ Monetag blocked or not loaded. Falling back to Adsterra.");
      return reject("Monetag script missing"); 
    }

    // FIRE THE AD
    show_10791512('pop')
      .then(() => {
        // The user watched the ad or closed it properly.
        console.log("✅ Monetag ad complete. Distributing reward...");
        resolve(true); // This tells your React game to give the Shards!
      })
      .catch(e => {
        // Monetag had no ads available, or the user encountered an error.
        console.warn("❌ Monetag ad failed or no fill:", e);
        reject(e); // This instantly triggers the Adsterra fallback!
      });
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