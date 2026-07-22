import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { 
  MOCK_USERS, 
  MOCK_ACCOUNTS, 
  MOCK_TRANSACTIONS, 
  MOCK_BENEFICIARIES, 
  MOCK_LOANS, 
  MOCK_DEBIT_CARDS, 
  MOCK_BILL_PAYMENTS, 
  MOCK_SUPPORT_TICKETS, 
  MOCK_AUDIT_LOGS 
} from './src/data/mockBankingData';
import { Account, Transaction, Loan, AuditLog, BillPayment, SupportTicket } from './src/types';

dotenv.config();

// In-memory persistent state simulation for live interactive session
let users = [...MOCK_USERS];
let accounts = [...MOCK_ACCOUNTS];
let transactions = [...MOCK_TRANSACTIONS];
let beneficiaries = [...MOCK_BENEFICIARIES];
let loans = [...MOCK_LOANS];
let debitCards = [...MOCK_DEBIT_CARDS];
let billPayments = [...MOCK_BILL_PAYMENTS];
let supportTickets = [...MOCK_SUPPORT_TICKETS];
let auditLogs = [...MOCK_AUDIT_LOGS];

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to append audit logs
  const addAuditLog = (actorId: string, actorName: string, actorRole: any, action: string, details: string, severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO') => {
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorRole,
      action,
      details,
      ipAddress: '103.21.124.89',
      severity
    };
    auditLogs.unshift(log);
  };

  // 1. Initial State API
  app.get('/api/banking/initial-state', (req: Request, res: Response) => {
    res.json({
      success: true,
      users,
      accounts,
      transactions,
      beneficiaries,
      loans,
      debitCards,
      billPayments,
      supportTickets,
      auditLogs
    });
  });

  // 2. Fund Transfer API
  app.post('/api/banking/transfer', (req: Request, res: Response) => {
    try {
      const { sourceAccNumber, destAccNumber, beneficiaryName, amount, transferMode, description, tPin } = req.body;

      if (!sourceAccNumber || !destAccNumber || !amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid transfer details provided.' });
      }

      if (tPin !== '1234') { // Default demo T-PIN is 1234
        addAuditLog('usr-101', 'Alice Smith', 'CUSTOMER', 'T_PIN_FAILED', `Failed T-PIN verification attempt for transfer of ₹${amount}`, 'WARNING');
        return res.status(401).json({ success: false, message: 'Invalid Transaction PIN (T-PIN). Demo T-PIN is 1234.' });
      }

      const sourceAcc = accounts.find(a => a.accountNumber === sourceAccNumber);
      const destAcc = accounts.find(a => a.accountNumber === destAccNumber);

      if (!sourceAcc) {
        return res.status(404).json({ success: false, message: 'Source account not found.' });
      }

      if (sourceAcc.balance < amount) {
        return res.status(400).json({ success: false, message: `Insufficient funds. Current balance: ₹${sourceAcc.balance.toLocaleString('en-IN')}` });
      }

      if (sourceAcc.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, message: 'Source account is frozen or inactive.' });
      }

      // Deduct from Source
      sourceAcc.balance -= amount;

      // Credit to Destination if internal
      if (destAcc) {
        destAcc.balance += amount;
      }

      const txnRef = `TXN-FNEX-${Math.floor(10000000 + Math.random() * 90000000)}`;
      const newTxn: Transaction = {
        id: `txn-${Date.now()}`,
        transactionRef: txnRef,
        sourceAccountId: sourceAcc.id,
        destAccountId: destAcc ? destAcc.id : undefined,
        sourceAccNumber: sourceAcc.accountNumber,
        destAccNumber,
        beneficiaryName: beneficiaryName || (destAcc ? destAcc.userName : 'External Beneficiary'),
        amount,
        type: 'TRANSFER',
        transferMode: transferMode || 'IMPS',
        status: 'SUCCESS',
        description: description || 'Fund Transfer',
        category: 'TRANSFER',
        timestamp: new Date().toISOString(),
        ipAddress: '103.21.124.89',
        deviceLocation: 'Noida, India',
        riskScore: amount > 100000 ? 35 : 5
      };

      transactions.unshift(newTxn);

      addAuditLog(
        sourceAcc.userId,
        sourceAcc.userName,
        'CUSTOMER',
        'FUND_TRANSFER_EXECUTED',
        `Transferred ₹${amount.toLocaleString('en-IN')} via ${transferMode || 'IMPS'} from ${sourceAccNumber} to ${destAccNumber}. TxnRef: ${txnRef}`,
        amount > 100000 ? 'WARNING' : 'INFO'
      );

      return res.json({
        success: true,
        message: 'Fund transfer completed successfully!',
        transaction: newTxn,
        updatedSourceBalance: sourceAcc.balance
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || 'Server error during transfer.' });
    }
  });

  // 3. Deposit / Withdrawal API
  app.post('/api/banking/deposit-withdraw', (req: Request, res: Response) => {
    const { accountNumber, amount, type, description } = req.body;
    const account = accounts.find(a => a.accountNumber === accountNumber);

    if (!account) return res.status(404).json({ success: false, message: 'Account not found.' });

    if (type === 'WITHDRAWAL' && account.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance for withdrawal.' });
    }

    if (type === 'DEPOSIT') {
      account.balance += amount;
    } else {
      account.balance -= amount;
    }

    const txnRef = `TXN-FNEX-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const newTxn: Transaction = {
      id: `txn-${Date.now()}`,
      transactionRef: txnRef,
      sourceAccountId: account.id,
      sourceAccNumber: account.accountNumber,
      amount,
      type: type,
      status: 'SUCCESS',
      description: description || `${type} Operation`,
      category: 'OTHER',
      timestamp: new Date().toISOString(),
      ipAddress: '103.21.124.89',
      deviceLocation: 'Self Service Banking',
      riskScore: 0
    };

    transactions.unshift(newTxn);

    addAuditLog(account.userId, account.userName, 'CUSTOMER', `${type}_EXECUTED`, `${type} of ₹${amount} on account ${accountNumber}`);

    return res.json({
      success: true,
      message: `${type} successful!`,
      newBalance: account.balance,
      transaction: newTxn
    });
  });

  // 4. Loan Application API
  app.post('/api/banking/loan-apply', (req: Request, res: Response) => {
    const { userId, userName, loanType, principalAmount, tenureMonths, purpose } = req.body;
    
    // Calculate EMI (Formula: P * r * (1+r)^n / ((1+r)^n - 1))
    const rate = loanType === 'HOME' ? 8.5 : loanType === 'CAR' ? 9.25 : loanType === 'EDUCATION' ? 7.9 : 11.25;
    const monthlyRate = rate / 12 / 100;
    const emi = Math.round((principalAmount * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / (Math.pow(1 + monthlyRate, tenureMonths) - 1));

    const newLoan: Loan = {
      id: `ln-${Date.now()}`,
      userId,
      userName: userName || 'Alice Smith',
      loanNumber: `${loanType.substring(0, 2)}L-2026-${Math.floor(10000 + Math.random() * 90000)}`,
      loanType,
      principalAmount,
      interestRate: rate,
      tenureMonths,
      emiAmount: emi,
      status: 'UNDER_REVIEW',
      creditScore: 785,
      purpose,
      appliedDate: new Date().toISOString().split('T')[0],
      remainingBalance: principalAmount
    };

    loans.unshift(newLoan);

    addAuditLog(userId, userName, 'CUSTOMER', 'LOAN_APPLICATION_SUBMITTED', `Applied for ${loanType} loan of ₹${principalAmount} for ${tenureMonths} months.`);

    res.json({ success: true, message: 'Loan application submitted for review.', loan: newLoan });
  });

  // 5. Admin Approve / Reject Loan
  app.post('/api/banking/loan-status', (req: Request, res: Response) => {
    const { loanId, status, adminId, adminName } = req.body;
    const loan = loans.find(l => l.id === loanId);

    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' });

    loan.status = status;

    if (status === 'APPROVED' || status === 'DISBURSED') {
      loan.status = 'DISBURSED';
      // Credit loan amount to user's primary savings account
      const userSavings = accounts.find(a => a.userId === loan.userId && a.type === 'SAVINGS');
      if (userSavings) {
        userSavings.balance += loan.principalAmount;
        
        const txnRef = `TXN-LOAN-${Math.floor(10000000 + Math.random() * 90000000)}`;
        transactions.unshift({
          id: `txn-${Date.now()}`,
          transactionRef: txnRef,
          sourceAccountId: userSavings.id,
          sourceAccNumber: userSavings.accountNumber,
          amount: loan.principalAmount,
          type: 'LOAN_DISBURSAL',
          status: 'SUCCESS',
          description: `Loan Disbursal - ${loan.loanNumber}`,
          category: 'LOAN',
          timestamp: new Date().toISOString(),
          ipAddress: '10.0.4.12',
          deviceLocation: 'Branch HQ',
          riskScore: 0
        });
      }
    }

    addAuditLog(adminId || 'usr-admin', adminName || 'Vikramaditya Rao', 'BRANCH_MANAGER', `LOAN_${status}`, `Updated loan ${loan.loanNumber} status to ${status}`);

    res.json({ success: true, message: `Loan ${loan.loanNumber} updated to ${loan.status}`, loan });
  });

  // 6. Card Freeze / Limit update
  app.post('/api/banking/card-freeze', (req: Request, res: Response) => {
    const { cardId, isFrozen } = req.body;
    const card = debitCards.find(c => c.id === cardId);

    if (!card) return res.status(404).json({ success: false, message: 'Card not found.' });

    card.isFrozen = isFrozen;

    addAuditLog('usr-101', 'Alice Smith', 'CUSTOMER', isFrozen ? 'CARD_FROZEN' : 'CARD_UNFROZEN', `Debit Card ${card.cardNumber} status set to ${isFrozen ? 'FROZEN' : 'ACTIVE'}`);

    res.json({ success: true, message: `Debit card ${isFrozen ? 'frozen' : 'unfrozen'} successfully.`, card });
  });

  // 7. Pay Bill API
  app.post('/api/banking/pay-bill', (req: Request, res: Response) => {
    const { billId, accountNumber } = req.body;
    const bill = billPayments.find(b => b.id === billId);
    const account = accounts.find(a => a.accountNumber === accountNumber);

    if (!bill || !account) return res.status(404).json({ success: false, message: 'Bill or Account not found.' });

    if (account.balance < bill.amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to pay bill.' });
    }

    account.balance -= bill.amount;
    bill.status = 'PAID';
    bill.lastPaidDate = new Date().toISOString().split('T')[0];

    const txnRef = `TXN-BILL-${Math.floor(10000000 + Math.random() * 90000000)}`;
    transactions.unshift({
      id: `txn-${Date.now()}`,
      transactionRef: txnRef,
      sourceAccountId: account.id,
      sourceAccNumber: account.accountNumber,
      amount: bill.amount,
      type: 'BILL_PAYMENT',
      status: 'SUCCESS',
      description: `Bill Paid: ${bill.billerName}`,
      category: 'UTILITIES',
      timestamp: new Date().toISOString(),
      ipAddress: '103.21.124.89',
      deviceLocation: 'Noida, India',
      riskScore: 0
    });

    addAuditLog('usr-101', 'Alice Smith', 'CUSTOMER', 'BILL_PAID', `Paid ₹${bill.amount} to ${bill.billerName}`);

    res.json({ success: true, message: `Paid bill for ${bill.billerName} successfully.`, updatedBalance: account.balance, bill });
  });

  // 8. Open FD API
  app.post('/api/banking/account-open', (req: Request, res: Response) => {
    const { userId, userName, sourceAccNumber, amount, tenureMonths } = req.body;
    const sourceAcc = accounts.find(a => a.accountNumber === sourceAccNumber);

    if (!sourceAcc || sourceAcc.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance in source account to open Fixed Deposit.' });
    }

    sourceAcc.balance -= amount;

    const rate = 7.5;
    const maturityAmount = Math.round(amount + (amount * rate * (tenureMonths / 12)) / 100);
    const fdAccNum = `FD900${Math.floor(1000000 + Math.random() * 9000000)}`;

    const newFd: Account = {
      id: `acc-${Date.now()}`,
      accountNumber: fdAccNum,
      userId,
      userName,
      type: 'FIXED_DEPOSIT',
      balance: amount,
      currency: 'INR',
      ifscCode: 'FNEX0001008',
      branchName: 'Noida Tech Hub Branch',
      status: 'ACTIVE',
      interestRate: rate,
      createdAt: new Date().toISOString().split('T')[0],
      tenureMonths,
      maturityAmount
    };

    accounts.push(newFd);

    transactions.unshift({
      id: `txn-${Date.now()}`,
      transactionRef: `TXN-FD-${Math.floor(10000000 + Math.random() * 90000000)}`,
      sourceAccountId: sourceAcc.id,
      sourceAccNumber: sourceAcc.accountNumber,
      destAccountId: newFd.id,
      destAccNumber: fdAccNum,
      amount,
      type: 'TRANSFER',
      status: 'SUCCESS',
      description: `Fixed Deposit Account Opening (${tenureMonths} Months)`,
      category: 'INVESTMENT',
      timestamp: new Date().toISOString(),
      ipAddress: '103.21.124.89',
      deviceLocation: 'Online Banking',
      riskScore: 0
    });

    addAuditLog(userId, userName, 'CUSTOMER', 'FD_CREATED', `Opened Fixed Deposit account ${fdAccNum} of ₹${amount} @ ${rate}% p.a.`);

    res.json({ success: true, message: 'Fixed Deposit created successfully!', account: newFd, updatedSourceBalance: sourceAcc.balance });
  });

  // 9. Support Ticket Creation
  app.post('/api/banking/ticket-create', (req: Request, res: Response) => {
    const { userId, userName, subject, category, message } = req.body;

    const newTicket: SupportTicket = {
      id: `tkt-${Date.now()}`,
      ticketRef: `TKT-${Math.floor(100000 + Math.random() * 900000)}`,
      userId,
      userName,
      subject,
      category,
      priority: 'MEDIUM',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      messages: [
        {
          sender: 'CUSTOMER',
          message,
          timestamp: new Date().toISOString()
        }
      ]
    };

    supportTickets.unshift(newTicket);
    addAuditLog(userId, userName, 'CUSTOMER', 'SUPPORT_TICKET_RAISED', `Ticket ${newTicket.ticketRef} created: ${subject}`);

    res.json({ success: true, message: 'Support ticket raised.', ticket: newTicket });
  });

  // 10. Gemini AI Financial Health & Advisor
  app.post('/api/gemini/advisor', async (req: Request, res: Response) => {
    try {
      const { userBalance, recentTxns, userQuery } = req.body;

      const prompt = `
You are FinTech Nexus AI Financial Advisor, a senior banking wealth manager.
The customer's current savings balance is ₹${userBalance}.
Recent Transactions: ${JSON.stringify(recentTxns)}.
Customer Query: "${userQuery || 'Give me a summary of my financial health and 3 actionable tips to grow my wealth.'}"

Provide a structured, professional, reassuring financial analysis in clear markdown. Include:
1. Executive Balance & Spending Analysis
2. Smart FD / Investment Opportunities (mention interest rates like 7.5% p.a.)
3. Personalized Money Management Recommendations
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt
      });

      res.json({ success: true, analysis: response.text });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'AI Financial Advisor error: ' + error.message });
    }
  });

  // 11. Gemini AI Fraud Sentinel
  app.post('/api/gemini/fraud-sentinel', async (req: Request, res: Response) => {
    try {
      const { transactionDetails } = req.body;

      const prompt = `
You are the AI Fraud Sentinel for an Online Banking System.
Analyze this transaction for potential fraud, anomaly, or security risk:
Transaction Details: ${JSON.stringify(transactionDetails)}

Evaluate:
1. Risk Level (LOW, MEDIUM, HIGH, CRITICAL)
2. Risk Score (0 to 100)
3. Reason for score (e.g. usual amount, rapid transfer, unknown IP, or clean legitimate transaction)
4. Recommended Action (APPROVE, CHALLENGE_2FA, FREEZE_ACCOUNT)

Respond in clean valid JSON with structure:
{
  "riskLevel": "LOW",
  "riskScore": 12,
  "reason": "Normal transaction size within customary user geographical boundaries.",
  "recommendedAction": "APPROVE"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({ success: true, riskAnalysis: parsed });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Fraud Sentinel error: ' + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
