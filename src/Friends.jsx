import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const Friends = ({ tgUser }) => {
  const [friendsList, setFriendsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // The reward you give for a successful invite
  const REFERRAL_REWARD = 10000; 

  // Generate the unique link using their Telegram ID
  const inviteLink = `https://t.me/Gift2uTapBot?start=${tgUser.id}`;

  const fetchFriends = useCallback(async () => {
    setIsLoading(true);
    try {
      // Find all players who have this user's ID in their "referred_by" column
      const { data, error } = await supabase
        .from('players')
        .select('username, shard_balance')
        .eq('referred_by', String(tgUser.id))
        .order('shard_balance', { ascending: false });

      if (error) throw error;
      setFriendsList(data || []);
    } catch (err) {
      console.error("Error fetching friends:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tgUser.id]);

  useEffect(() => {
    if (tgUser?.id && tgUser.id !== "test_local_user") {
      fetchFriends();
    } else {
      setIsLoading(false); // Stop loading if it's just the local test environment
    }
  }, [fetchFriends, tgUser.id]);

  const handleInvite = () => {
    const text = `🎁 Join me on Gift! Tap to earn shards and move your way up the leaderboard! You get a head start, and we both earn bonuses.`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    
    // Opens the Telegram native share menu
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
    } else {
      // Fallback for browser testing
      window.open(url, '_blank');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    alert("Invite link copied to clipboard!");
  };

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      
      {/* Header Info */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '50px', marginBottom: '10px' }}>🤝</div>
        <h2 style={{ color: '#ffd700', fontSize: '24px', margin: '0 0 5px 0' }}>Invite Friends</h2>
        <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
          Earn <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+{REFERRAL_REWARD.toLocaleString()} Shards</span> for every friend who joins using your link!
        </p>
      </div>

      {/* Invite Action Buttons */}
      <div style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #333', marginBottom: '25px' }}>
        <button 
          onClick={handleInvite}
          style={{ width: '100%', background: '#9945FF', color: '#fff', border: 'none', padding: '15px', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
        >
          <span>↗️</span> Send Telegram Invite
        </button>
        
        <button 
          onClick={handleCopy}
          style={{ width: '100%', background: '#111', color: '#ccc', border: '1px solid #555', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
        >
          <span>📋</span> Copy Invite Link
        </button>
      </div>

      {/* Friends List */}
      <div style={{ textAlign: 'left' }}>
        <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          Your Referrals ({friendsList.length})
        </h3>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Loading friends...</div>
        ) : friendsList.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#111', padding: '30px 20px', borderRadius: '12px', border: '1px dashed #333' }}>
            <div style={{ fontSize: '30px', marginBottom: '10px' }}>🚷</div>
            <div style={{ color: '#888', fontSize: '13px' }}>You haven't invited anyone yet.</div>
            <div style={{ color: '#555', fontSize: '11px', marginTop: '5px' }}>Share your link to start earning!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {friendsList.map((friend, index) => (
              <div key={index} style={{ background: '#111', borderRadius: '12px', padding: '12px 15px', border: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: '#333', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px' }}>
                    👤
                  </div>
                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                    {friend.username || 'Anonymous Player'}
                  </span>
                </div>
                <div style={{ color: '#ffd700', fontSize: '12px', fontWeight: 'bold' }}>
                  {friend.shard_balance?.toLocaleString() || 0} 💎
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default Friends;