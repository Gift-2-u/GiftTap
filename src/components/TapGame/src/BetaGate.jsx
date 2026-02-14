import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Ensure this path is correct

const BetaGate = ({ telegramId, onAccessGranted }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('IDLE'); // IDLE, CHECKING, ERROR

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code) return;

    setStatus('CHECKING');
    
    // 1. We just pass the code up to GiftTap.jsx
    // We do NOT touch Supabase here.
    await onAccessGranted(code);
    
    // If onAccessGranted fails, it will alert. 
    // If it succeeds, this component will disappear anyway.
    setStatus('IDLE');
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