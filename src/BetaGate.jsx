import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Ensure this path is correct

const BetaGate = ({ telegramId, onAccessGranted }) => {
  // 1. We define 'loading' here so the HTML can find it
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true); 
    setErrorMessage(''); // Clear out any old errors from the last attempt
    
    try {
      // 1. Call your secure Postgres function directly
      const { data, error } = await supabase.rpc('redeem_any_code', {
        target_code: code.trim().toUpperCase(), // Enforce uppercase for EARLY10 or GIFT-XXXX
        player_tg_id: telegramId ? telegramId.toString() : ''
      });

      // 2. Handle database exceptions (invalid code, max uses reached, etc.)
      if (error) {
        if (error.message.includes('maximum uses')) {
          setErrorMessage('Too late! This code has reached its maximum uses.');
        } else if (error.message.includes('already has beta access')) {
          setErrorMessage('You already have access! Refreshing game...');
          onAccessGranted(); // Let them through anyway since they are verified
        } else {
          setErrorMessage('Invalid code. Check your spelling or hunt for a new one.');
        }
        setLoading(false);
        return;
      }

      // 3. Success! Pass the signal up to the parent component to unlock the UI
      onAccessGranted();
      
    } catch (err) {
      setErrorMessage('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px', color: '#00f2ff', background: '#000', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>BETA ACCESS REQUIRED</h1>
      <p style={{ color: '#fff' }}>Gift Tap is currently Invite-Only.</p>
      
      <form onSubmit={handleSubmit} style={{ margin: '30px 0' }}>
        <input 
          value={code} 
          onChange={(e) => setCode(e.target.value)} 
          placeholder="ENTER CODE (GIFT-XXXXXX)" 
          disabled={loading}
          style={{ 
            padding: '12px', 
            background: '#111', 
            color: '#fff', 
            border: '2px solid #00f2ff', 
            borderRadius: '4px',
            outline: 'none',
            textTransform: 'uppercase' // Visual feedback for uppercase forcing
          }}
        />
        <button 
          type="submit" 
          disabled={loading} 
          style={{ 
            padding: '12px 24px', 
            marginLeft: '10px', 
            background: loading ? '#333' : '#00f2ff', 
            color: '#000', 
            border: 'none', 
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'VERIFYING...' : 'UNLOCK'}
        </button>
      </form>

      {/* Dynamic error display so players know exactly what went wrong */}
      {errorMessage && (
        <p style={{ color: '#ff3b3b', fontWeight: 'bold', marginBottom: '20px' }}>
          ⚠️ {errorMessage}
        </p>
      )}
      
      <p style={{ marginTop: '40px', fontSize: '13px', color: '#888' }}>
        Follow <a href="https://x.com/Gift2udev" target="_blank" rel="noreferrer" style={{ color: '#00f2ff' }}>@Gift2udev</a> &{' '}
        <a href="https://t.me/Gift2u_GiftTap_official" target="_blank" rel="noreferrer" style={{ color: '#00f2ff' }}>Telegram Channel</a> for daily code drops.
      </p>
    </div>
  );
};

export default BetaGate;

  const handleSubmit_old = async (e) => {
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
      <p style={{ marginTop: '20px', fontSize: '12px' }}>Follow @Gift2udev & https://t.me/Gift2u_GiftTap_official for daily code drops.</p>
    </div>
  );


export default BetaGate;