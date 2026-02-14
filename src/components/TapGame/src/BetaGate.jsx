import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Ensure this path is correct

const BetaGate = ({ telegramId, onAccessGranted }) => {
  // 1. We define 'loading' here so the HTML can find it
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code) return;

    setLoading(true); // Turn ON loading
    
    // Pass the code up to the main game
    await onAccessGranted(code);
    
    setLoading(false); // Turn OFF loading (if it failed)
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px', color: '#00f2ff', background: '#000', height: '100vh' }}>
      <h1>BETA ACCESS REQUIRED</h1>
      <p>Gift Tap is currently Invite-Only.</p>
      <form onSubmit={handleSubmit}>
        <input 
          value={code} 
          onChange={(e) => setCode(e.target.value)} 
          placeholder="ENTER CODE (GIFT-XXXXXX)" 
          style={{ padding: '10px', background: '#222', color: '#fff', border: '1px solid #00f2ff' }}
        />
        <button type="submit" disabled={loading} style={{ padding: '10px 20px', marginLeft: '10px' }}>
          {loading ? 'VERIFYING...' : 'UNLOCK'}
        </button>
      </form>
      <p style={{ marginTop: '20px', fontSize: '12px' }}>Follow @gift2utoken & https://t.me/Gift2u_GiftTap_official for daily code drops.</p>
    </div>
  );
};

export default BetaGate;