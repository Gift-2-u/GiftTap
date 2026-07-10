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
    const adController = window.Adsgram.init({ blockId: "26020" });

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
    // 1. You must create a "Direct Link" in your Monetag dashboard and paste it here.
    const directLinkUrl = https://omg10.com/4/11263036;

    if (!directLinkUrl || directLinkUrl === "https://omg10.com/4/11263036") {
      console.warn("⚠️ Monetag Direct Link missing. Falling back to Adsterra.");
      return reject("Monetag not configured");
    }

    try {
      // Open reward link in a new tab (web app)
      window.open(directLinkUrl, '_blank', 'noopener,noreferrer');

      // 3. The Security Timer
      // Since direct links don't have a callback, we force a 5-second delay 
      // before giving the reward to prevent users from spamming the button.
      setTimeout(() => {
        console.log("✅ Monetag Direct Link viewed. Distributing fallback reward...");
        resolve(true);
      }, 5000);

    } catch (e) {
      console.warn("❌ Failed to launch Monetag link:", e);
      reject(e);
    }
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