/**
 * x402 Wallet Module
 * Manages agent wallet for Base network USDC payments
 */

import {
  createWalletClient,
  createPublicClient,
  http,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { WalletBalance, TransferResult, X402Network } from './types.js';

/**
 * USDC contract address on Base
 */
const USDC_BASE_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const;

/**
 * ERC20 ABI for USDC operations
 */
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

/**
 * Agent Wallet for x402 payments
 * Manages USDC transactions on Base network
 */
export class AgentWallet {
  private account: PrivateKeyAccount;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  private network: X402Network = 'base';

  constructor(
    privateKey: string,
    rpcUrl: string = 'https://mainnet.base.org'
  ) {
    // Validate private key format
    if (!privateKey.startsWith('0x')) {
      privateKey = `0x${privateKey}`;
    }

    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(rpcUrl),
    });
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.account.address;
  }

  /**
   * Get the network this wallet uses
   */
  getNetwork(): X402Network {
    return this.network;
  }

  /**
   * Get USDC balance
   */
  async getBalance(): Promise<WalletBalance> {
    try {
      const balance = await this.publicClient.readContract({
        address: USDC_BASE_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      });

      const balanceNum = Number(balance) / 1e6;
      const formatted = balanceNum.toFixed(2);

      return {
        usdc: balance.toString(),
        formatted: `$${formatted} USDC`,
        network: this.network,
      };
    } catch (error) {
      throw new Error(
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get ETH balance for gas
   */
  async getEthBalance(): Promise<string> {
    try {
      const balance = await this.publicClient.getBalance({
        address: this.account.address,
      });
      const ethBalance = Number(balance) / 1e18;
      return ethBalance.toFixed(6);
    } catch (error) {
      throw new Error(
        `Failed to get ETH balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if wallet has sufficient balance for a transaction
   */
  async hasSufficientBalance(amountMicroUSDC: string): Promise<boolean> {
    const balance = await this.getBalance();
    return BigInt(balance.usdc) >= BigInt(amountMicroUSDC);
  }

  /**
   * Send USDC payment
   */
  async sendUSDC(
    recipient: string,
    amountMicroUSDC: string
  ): Promise<TransferResult> {
    // Validate recipient format
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }

    // Check balance
    const hasFunds = await this.hasSufficientBalance(amountMicroUSDC);
    if (!hasFunds) {
      const balance = await this.getBalance();
      throw new Error(
        `Insufficient USDC balance. Required: ${Number(amountMicroUSDC) / 1e6} USDC, Available: ${balance.formatted}`
      );
    }

    try {
      // Send USDC transfer transaction
      const hash = await this.walletClient.writeContract({
        address: USDC_BASE_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(amountMicroUSDC)],
        chain: base,
        account: this.account,
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000, // 60 seconds
      });

      if (receipt.status !== 'success') {
        throw new Error('Transaction failed on-chain');
      }

      return {
        transactionHash: hash,
        network: this.network,
        amount: amountMicroUSDC,
        recipient,
      };
    } catch (error) {
      // Handle specific error types
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('insufficient funds')) {
        throw new Error('Insufficient ETH for gas fees. Please add ETH to your wallet.');
      }

      if (message.includes('user rejected')) {
        throw new Error('Transaction was rejected');
      }

      throw new Error(`USDC transfer failed: ${message}`);
    }
  }

  /**
   * Estimate gas for a USDC transfer
   */
  async estimateGas(
    recipient: string,
    amountMicroUSDC: string
  ): Promise<{ gas: string; gasCostEth: string }> {
    try {
      const gas = await this.publicClient.estimateContractGas({
        address: USDC_BASE_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(amountMicroUSDC)],
        account: this.account,
      });

      const gasPrice = await this.publicClient.getGasPrice();
      const gasCost = gas * gasPrice;
      const gasCostEth = (Number(gasCost) / 1e18).toFixed(6);

      return {
        gas: gas.toString(),
        gasCostEth,
      };
    } catch (error) {
      throw new Error(
        `Failed to estimate gas: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get wallet info summary
   */
  async getInfo(): Promise<{
    address: string;
    network: X402Network;
    usdcBalance: WalletBalance;
    ethBalance: string;
  }> {
    const [usdcBalance, ethBalance] = await Promise.all([
      this.getBalance(),
      this.getEthBalance(),
    ]);

    return {
      address: this.address,
      network: this.network,
      usdcBalance,
      ethBalance: `${ethBalance} ETH`,
    };
  }
}

/**
 * Create an agent wallet from environment or config
 */
export function createAgentWallet(
  privateKey: string,
  rpcUrl?: string
): AgentWallet {
  if (!privateKey) {
    throw new Error(
      'Wallet private key is required. Set AGENT_WALLET_KEY environment variable.'
    );
  }

  return new AgentWallet(privateKey, rpcUrl);
}
