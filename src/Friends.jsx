import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getInviteLink } from './playerIdentity';
import { REFERRAL } from './referralRewards';

const Friends = ({ player, tgUser }) => {
  const user = player || tgUser;
  const [friendsList, setFriendsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const JOINER_REWARD = REFERRAL.JOINER_ON_JOIN; // 500
  const LVL1_REWARD = REFERRAL.REFERRER_LVL1; // 1000
  const WALL5_REWARD = REFERRAL.REFERRER_WALL5; // 3000

  const inviteLink = getInviteLink(user?.id);

  const fetchFriends = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('players')
        .select('username, shard_balance, lifetime_taps, referral_lvl1_paid, referral_wall5_paid, max_unlocked_level')
        .eq('referred_by', String(user.id))
        .order('shard_balance', { ascending: false });

      if (error) {
        // Fallback if milestone columns not migrated yet
        const fallback = await supabase
          .from('players')
          .select('username, shard_balance, lifetime_taps')
          .eq('referred_by', String(user.id))
          .order('shard_balance', { ascending: false });
        if (fallback.error) throw fallback.error;
        setFriendsList(fallback.data || []);
      } else {
        setFriendsList(data || []);
      }
    } catch (err) {
      console.error('Error fetching friends:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchFriends();
    else setIsLoading(false);
  }, [fetchFriends, user?.id]);

  const shareText = `🎁 I'm grinding levels in Gift Tap! Join with my link and get ${JOINER_REWARD} free G2Ushards. I earn bonuses when you hit Level 1 and pass the Level 5 wall!\n\n${inviteLink}`;

  const handleInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Gift Tap', text: shareText, url: inviteLink });
        return;
      }
    } catch {
      /* cancelled */
    }
    await navigator.clipboard.writeText(shareText);
    alert('Invite text copied! Paste it anywhere to share.');
  };

  const handleInviteX = () => {
    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Invite link copied to clipboard!');
  };

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '50px', marginBottom: '10px' }}>🤝</div>
        <h2 style={{ color: '#ffd700', fontSize: '24px', margin: '0 0 5px 0' }}>Invite Friends</h2>
        <p style={{ color: '#888', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>
          Friends get <span style={{ color: '#ffd700', fontWeight: 'bold' }}>+{JOINER_REWARD.toLocaleString()} Shards</span> when they join.
          <br />
          You earn:
          <br />
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+{LVL1_REWARD.toLocaleString()}</span> when they reach <strong>Level 1</strong>
          <br />
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+{WALL5_REWARD.toLocaleString()}</span> when they pass the <strong>Level 5 wall</strong>
        </p>
      </div>

      <div style={{ background: '#1c1e22', borderRadius: '15px', padding: '15px', border: '1px solid #333', marginBottom: '25px' }}>
        <button
          onClick={handleInvite}
          style={{ width: '100%', background: '#24A1DE', color: '#fff', border: 'none', padding: '15px', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '10px' }}
        >
          Share Invite
        </button>
        <button
          onClick={handleInviteX}
          style={{ width: '100%', background: '#000000', color: '#ffffff', border: '1px solid #333', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginBottom: '10px' }}
        >
          𝕏 Send invite on X
        </button>
        <button
          onClick={handleCopy}
          style={{ width: '100%', background: '#111', color: '#ccc', border: '1px solid #555', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
        >
          📋 Copy Invite Link
        </button>
      </div>

      <div style={{ textAlign: 'left' }}>
        <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          Your Referrals ({friendsList.length})
        </h3>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Loading friends...</div>
        ) : friendsList.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#111', padding: '30px 20px', borderRadius: '12px', border: '1px dashed #333' }}>
            <div style={{ fontSize: '30px', marginBottom: '10px' }}>🚷</div>
            <div style={{ color: '#888', fontSize: '13px' }}>You haven&apos;t invited anyone yet.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {friendsList.map((friend, index) => {
              const lvl1 = friend.referral_lvl1_paid || Number(friend.lifetime_taps) >= 10000;
              const wall5 = friend.referral_wall5_paid || Number(friend.max_unlocked_level) >= 9;
              return (
                <div
                  key={index}
                  style={{ background: '#111', borderRadius: '12px', padding: '12px 15px', border: '1px solid #222' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                      {friend.username || 'Anonymous'}
                    </span>
                    <span style={{ color: '#ffd700', fontSize: '12px', fontWeight: 'bold' }}>
                      {friend.shard_balance?.toLocaleString() || 0} 💎
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px', marginTop: '6px' }}>
                    L1 {lvl1 ? '✅' : '⏳'} · Wall 5 {wall5 ? '✅' : '⏳'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Friends;
