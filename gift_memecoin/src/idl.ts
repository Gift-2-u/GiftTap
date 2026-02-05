export const IDL = {
    "address": "CX5aqenEeWvfwvhF8Xek8Dd6sVPn8uHRhXafbKQvUAxy",
    "metadata": {
    "name": "gift_staking",
    "version": "0.1.0",
    "spec": "0.1.0"
    },
    "instructions":[
        {"name":"initializeStake",
    "accounts":[
        {"name":"stakeAccount","isMut":true,"isSigner":false},
        {"name":"user","isMut":true,"isSigner":true},
        {"name":"systemProgram","isMut":false,"isSigner":false}],
    "args":[]},{"name":"stake",
    "accounts":[
        {"name":"user","isMut":true,"isSigner":true},
        {"name":"userTokenAccount","isMut":true,"isSigner":false},
        {"name":"vaultAuthority","isMut":false,"isSigner":false},
        {"name":"vaultTokenAccount","isMut":true,"isSigner":false},
        {"name":"stakeAccount","isMut":true,"isSigner":false},
        {"name":"tokenProgram","isMut":false,"isSigner":false}],
    "args":[
        {"name":"amount","type":"u64"}]},
        {"name":"unstake",
    "accounts":[
        {"name":"user","isMut":true,"isSigner":true},
        {"name":"userTokenAccount","isMut":true,"isSigner":false},
        {"name":"vaultAuthority","isMut":false,"isSigner":false},
        {"name":"vaultTokenAccount","isMut":true,"isSigner":false},
        {"name":"stakeAccount","isMut":true,"isSigner":false},
        {"name":"tokenProgram","isMut":false,"isSigner":false}],
    "args":[{"name":"amount","type":"u64"}]}],
    "types":[
    {
        "name":"StakeInfo",
        "type":{
            "kind":"struct",
            "fields":[
                {"name":"owner","type":"publicKey"},
                {"name":"amount","type":"u64"},
                {"name":"lastUpdateTs","type":"i64"}
            ]
        }
    }
    ],
"errors":[{"code":6000,"name":"InsufficientFunds","msg":"You do not have enough staked tokens."}]}