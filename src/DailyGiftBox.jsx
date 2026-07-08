import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import giftLogo from './components/Gift2u_logo.png';
import { motion } from 'framer-motion';

const DailyGiftBox = ({ wallet, connection }) => {
  const [canClaim, setCanClaim] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [isPressed, setIsPressed] = useState(false);

  // Check if reward is ready
  useEffect(() => {
    if (!wallet || !wallet.publicKey) {
      setCanClaim(false);
      return;
    }

    const claimKey = `last_claim_${wallet.publicKey.toBase58()}`;
    const mockLastClaim = localStorage.getItem(claimKey) || 0;
    const now = Math.floor(Date.now() / 1000);
    const ONE_DAY = 86400; // 24 hours

    if (now - mockLastClaim >= ONE_DAY) {
      setCanClaim(true);
    } else {
      setCanClaim(false);
    }
  }, [wallet]);

  const handleClaim = async () => {
    if (!wallet || !wallet.publicKey) return toast.error("Connect your wallet first!");
    if (!canClaim) return;
    
    // Future Solana Program claim logic goes here
    
    toast.success("🎁 Mystery Gift Opened! +10 GIFT");
    localStorage.setItem(`last_claim_${wallet.publicKey.toBase58()}`, Math.floor(Date.now() / 1000));
    setCanClaim(false);
    setIsPressed(false);
  };

  return (
    <div className="mt-2 p-4 w-full max-w-md mx-auto flex flex-col items-center">
      
      {/* THE GIFT ZONE */}
      <div 
        className="relative flex justify-center items-center w-full min-h-[300px] mt-8 mb-4"
        style={{ cursor: canClaim ? 'pointer' : 'default' }}
        onPointerDown={() => canClaim && setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        onClick={canClaim ? handleClaim : undefined}
      >
        {/* Pro Touch: The blue Hamster-style halo */}
        <div style={{ 
          position: 'absolute', 
          width: '250px', 
          height: '250px', 
          background: 'radial-gradient(circle, rgba(50, 100, 255, 0.3) 0%, transparent 70%)', 
          zIndex: 0, 
          borderRadius: '50%', 
          // marginTop: '-60px' // Adjusted to center nicely in the web div
        }} />

        {/* The Gift Box */}
        <motion.div
          whileTap={canClaim ? { scale: 0.94 } : {}}
          style={{ 
            zIndex: 5, 
            position: 'relative', 
            opacity: canClaim ? 1 : 0.6, // Dims the box if it's not ready to claim
          }}
        >
          <img 
            src={giftLogo} 
            alt="Gift"
            onDragStart={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            style={{ 
              width: '280px', 
              height: 'auto', 
              // Your exact yellow glow logic
              filter: (canClaim && isPressed) 
                ? 'drop-shadow(0 0 25px rgba(255, 215, 0, 0.9)) brightness(1.1)' 
                : 'drop-shadow(0 0 5px rgba(255, 215, 0, 0.2))',
              transition: 'filter 0.1s ease-out',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }} 
          />
        </motion.div>
      </div>
      
      <h3 className="text-xl font-bold mb-6 mt-4">
        {canClaim ? "Your Daily Gift Tap is Ready!" : "Next Gift Charging..."}
      </h3>
      
      <button 
        onClick={handleClaim}
        disabled={!canClaim}
        className={`w-full py-4 rounded-full font-black tracking-widest transition-all ${
          canClaim 
          ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-105 shadow-[0_0_20px_rgba(168,85,247,0.4)] text-white" 
          : "bg-slate-800 border border-slate-700 text-gray-500 cursor-not-allowed"
        }`}
      >
        {canClaim ? "CLAIM NOW" : "CHECK BACK LATER"}
      </button>
    </div>
  );
};

export default DailyGiftBox;