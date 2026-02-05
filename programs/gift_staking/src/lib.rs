use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer}; 
use anchor_spl::associated_token::AssociatedToken;

declare_id!("CX5aqenEeWvfwvhF8Xek8Dd6sVPn8uHRhXafbKQvUAxy");

// The hardcoded address you provided
pub const VAULT_ADDRESS: &str = "6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk";

#[program]
pub mod gift_staking {
    use super::*;

    pub fn initialize_stake(ctx: Context<InitializeStake>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.owner = *ctx.accounts.user.key;
        stake_account.amount = 0;
        stake_account.last_update_ts = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        // Set the owner if this is a new account!
        if stake_account.owner == Pubkey::default() {
            stake_account.owner = ctx.accounts.user.key();
        }
        let now = Clock::get()?.unix_timestamp;

        // 1. Calculate & Compound existing rewards before adding new stake
        let pending_rewards = calculate_rewards(stake_account.amount, stake_account.last_update_ts, now);
        stake_account.amount += pending_rewards;
        
        // 2. THE TRANSFER: User -> Vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // 3. Update state with new deposit
        stake_account.amount += amount;
        stake_account.last_update_ts = now;
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        let now = Clock::get()?.unix_timestamp;

        // 1. Compound rewards first so the user withdraws from an updated balance
        let pending_rewards = calculate_rewards(stake_account.amount, stake_account.last_update_ts, now);
        stake_account.amount += pending_rewards;

        require!(stake_account.amount >= amount, ErrorCode::InsufficientFunds);

        // 2. Prepare the PDA Signer
        // Note: You must use the same seeds used to create the vault's owner
        // Inside the unstake function body
        let bump = ctx.bumps.vault_authority;
        let seeds: &[&[u8]] = &[b"vault", &[bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer
            ),
            amount,
        )?;

        stake_account.amount = stake_account.amount.checked_sub(amount).unwrap();
        stake_account.last_update_ts = now;
        
        Ok(())
    }
}

fn calculate_rewards(principal: u64, last_ts: i64, now: i64) -> u64 {
    if principal == 0 { return 0; }
    let duration = (now - last_ts) as u64;
    
    // Formula: (Principal * Rate * Time) / SecondsPerYear
    // Example: 10% APY
    let annual_rate_bps = 1000000; // 1000 basis points = 10%
    let seconds_in_year = 31_536_000;
    
    (principal * annual_rate_bps * duration) / (10000 * seconds_in_year)
}

#[derive(Accounts)]
pub struct InitializeStake<'info> {
    #[account(init, payer = user, space = 8 + 32 + 8 + 8, seeds = [b"stake", user.key().as_ref()], bump)]
    pub stake_account: Account<'info, StakeInfo>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: The Global Vault Authority
    #[account(seeds = [b"vault"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: The Global Vault Token Account (already created)
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    // Re-add 'init' here because this account is NEW for the user
    #[account(
        init_if_needed, 
        payer = user, 
        space = 8 + 8 + 8 + 32, // Discriminator + amount + time + pubkey
        seeds = [b"stake", user.key().as_ref()], 
        bump
    )]
    pub stake_account: Account<'info, StakeInfo>,

    pub system_program: Program<'info, System>, // Required for 'init'
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for vault
    #[account(seeds = [b"vault"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
    mut,
    /// CHECK: Add the * here to dereference the owner
    constraint = *vault_token_account.to_account_info().owner == vault_authority.key()
    )]
    pub vault_token_account: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"stake", user.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeInfo>,

    pub token_program: Program<'info, Token>,
}
// DO THE EXACT SAME FOR THE UNSTAKE STRUCT

#[account]
pub struct StakeInfo {
    pub owner: Pubkey,
    pub amount: u64,
    pub last_update_ts: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("You do not have enough staked tokens.")]
    InsufficientFunds,
}