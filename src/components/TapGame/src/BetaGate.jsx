import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Ensure this path is correct

const BetaGate = ({ telegramId, onAccessGranted }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const checkCode = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. Check if code exists and isn't used
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_used', false)
      .single();

    if (data) {
      // 2. Mark code as used
      await supabase.from('invite_codes').update({ is_used: true, used_by: telegramId }).eq('code', code.toUpperCase());
      // 3. Grant player permanent access
      await supabase.from('players').update({ has_beta_access: true }).eq('telegram_id', telegramId);
      
      onAccessGranted();
    } else {
      alert("Invalid or Expired Code");
    }
    setLoading(false);
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px', color: '#00f2ff', background: '#000', height: '100vh' }}>
      <h1>BETA ACCESS REQUIRED</h1>
      <p>Gift Tap is currently Invite-Only.</p>
      <form onSubmit={checkCode}>
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
      <p style={{ marginTop: '20px', fontSize: '12px' }}>Follow @YourXHandle for daily code drops.</p>
    </div>
  );
};

export default BetaGate;