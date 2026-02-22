import React from 'react';

const Friends = ({ tgUser, balance }) => {
  // Generate the referral link using your bot's username
  const botUsername = 'Gift2uTapBot'; 
  const inviteLink = `https://t.me/${Gift2uTapBot}?start=${tgUser.id}`;

  const handleInvite = () => {
    const text = encodeURIComponent("🎁 Join me on GiftTap and earn GFT shards! Use my link to get a starter bonus:");
    const url = `https://t.me/Gift2u_GiftTap_official=${inviteLink}&text=${text}`;
    window.open(url, '_blank');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    alert("Link copied to clipboard!");
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Invite Friends</h2>
      <p style={styles.subtitle}>Receive 1,000 shards for every friend you invite!</p>
      
      <div style={styles.inviteBox}>
        <div style={styles.linkText}>{inviteLink}</div>
        <button onClick={copyToClipboard} style={styles.copyBtn}>Copy</button>
      </div>

      <button onClick={handleInvite} style={styles.mainInviteBtn}>
        Send Invite 🚀
      </button>

      <div style={styles.friendListHeader}>Your Referrals (0)</div>
      <div style={styles.emptyState}>No friends invited yet. Start sharing!</div>
    </div>
  );
};

const styles = {
  container: { padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  title: { color: '#ffd700', marginBottom: '10px' },
  subtitle: { textAlign: 'center', color: '#888', marginBottom: '30px' },
  inviteBox: { background: '#222', padding: '15px', borderRadius: '15px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333' },
  linkText: { color: '#ffd700', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' },
  copyBtn: { background: 'none', color: '#5578da', border: 'none', fontWeight: 'bold' },
  mainInviteBtn: { width: '100%', background: '#ffd700', color: '#000', padding: '15px', borderRadius: '15px', fontWeight: 'bold', marginTop: '20px', border: 'none' },
  friendListHeader: { alignSelf: 'flex-start', marginTop: '40px', fontWeight: 'bold', color: '#fff' },
  emptyState: { marginTop: '20px', color: '#444' }
};

export default Friends;