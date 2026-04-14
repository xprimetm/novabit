export type PlatformStoreDriver = 'in-memory' | 'postgres';
export type ConfiguredPlatformStoreDriver = 'auto' | 'memory' | 'postgres';
export type UserRole = 'user' | 'admin';
export type CelebrityCouponStatus = 'active' | 'inactive';
export type VerificationChannel = 'email' | 'phone';
export type AccountStatus = 'active' | 'suspended' | 'deactivated';
export type AdminUserAccountAction = 'activate' | 'suspend' | 'deactivate';

export type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  country: string;
  coupon: string | null;
  couponAccepted: boolean;
  accountStatus: AccountStatus;
  createdAt: string;
};

export type ContactSubmission = {
  id: string;
  reference: string;
  topic: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export type PasswordResetRequest = {
  id: string;
  reference: string;
  email: string;
  createdAt: string;
};

export type PendingRegistration = {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  country: string;
  coupon: string | null;
  verificationChannel: VerificationChannel;
  expiresAt: string;
  createdAt: string;
};

export type PlatformSession = {
  token: string;
  expiresAt: string;
  remember: boolean;
};

export type DashboardVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export type DashboardStatementEntryKind =
  | 'account_created'
  | 'deposit'
  | 'withdrawal'
  | 'bonus'
  | 'trade'
  | 'note';

export type DashboardStatementEntryStatus = 'completed' | 'pending' | 'info';

export type DashboardTradeSide = 'buy' | 'sell';

export type DashboardTradeStatus = 'pending' | 'open' | 'closed';

export type DashboardPortfolioStatus = 'active' | 'pending' | 'closed';

export type PaymentSubmissionMethod = 'crypto' | 'card' | 'fan';

export type PaymentSubmissionStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'rejected';

export type WithdrawalSubmissionMethod = 'crypto' | 'bank' | 'wire';

export type WithdrawalSubmissionStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'rejected';

export type KycDocumentType =
  | 'passport'
  | 'drivers_license'
  | 'national_id'
  | 'other';

export type KycSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type DashboardStatementEntry = {
  id: string;
  kind: DashboardStatementEntryKind;
  title: string;
  description: string;
  amount: number | null;
  status: DashboardStatementEntryStatus;
  createdAt: string;
  sourceKey?: string | null;
  emailDeliveredAt?: string | null;
};

export type DailyInterestEmailDispatch = {
  entries: DashboardStatementEntry[];
  availableBalance: number;
  totalProfit: number;
};

export type DashboardTradeRecord = {
  id: string;
  assetSymbol: string;
  assetName: string;
  side: DashboardTradeSide;
  amount: number;
  status: DashboardTradeStatus;
  openedAt: string;
};

export type DashboardPortfolioPosition = {
  id: string;
  assetSymbol: string;
  assetName: string;
  allocationUsd: number;
  status: DashboardPortfolioStatus;
  pnl: number;
  openedAt: string;
};

export type DashboardAccount = {
  userId: string;
  accountRole: string;
  accountState: string;
  verificationStatus: DashboardVerificationStatus;
  walletConnected: boolean;
  accountBalance: number;
  totalProfit: number;
  totalDeposit: number;
  totalWithdrawal: number;
  bonusBalance: number;
  demoBalance: number;
  activePlans: number;
  pendingItems: number;
  referralCode: string;
  referralRatePercent: number;
  statementEntries: DashboardStatementEntry[];
  tradeRecords: DashboardTradeRecord[];
  portfolioPositions: DashboardPortfolioPosition[];
  updatedAt: string;
};

export type PaymentSubmission = {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  userUsername?: string | null;
  userPhone?: string | null;
  userCountry?: string | null;
  userCreatedAt?: string | null;
  planKey: string;
  planName: string;
  fundingMethod: PaymentSubmissionMethod;
  amount: number;
  assetKey: string | null;
  assetSymbol: string | null;
  assetName: string | null;
  network: string | null;
  routeAddress: string | null;
  proofImageDataUrl: string;
  proofFileName: string;
  proofMimeType: string;
  proofNote: string | null;
  status: PaymentSubmissionStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export type WithdrawalSubmission = {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  userUsername?: string | null;
  userPhone?: string | null;
  userCountry?: string | null;
  userCreatedAt?: string | null;
  withdrawalMethod: WithdrawalSubmissionMethod;
  amount: number;
  estimatedFee: number;
  netAmount: number;
  assetKey: string | null;
  assetSymbol: string | null;
  assetName: string | null;
  network: string | null;
  walletAddress: string | null;
  walletLabel: string | null;
  bankHolder: string | null;
  bankName: string | null;
  bankRouting: string | null;
  bankAccount: string | null;
  bankCountry: string | null;
  wireBeneficiary: string | null;
  wireBankName: string | null;
  wireSwift: string | null;
  wireIban: string | null;
  wireCountry: string | null;
  wireNote: string | null;
  status: WithdrawalSubmissionStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export type KycSubmission = {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  userUsername?: string | null;
  userPhone?: string | null;
  userCountry?: string | null;
  userCreatedAt?: string | null;
  email: string;
  phone: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  countryOfOrigin: string;
  documentType: KycDocumentType;
  documentImageDataUrl: string;
  documentFileName: string;
  documentMimeType: string;
  status: KycSubmissionStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export type AdminUserProfile = PublicUser & {
  verificationStatus: DashboardVerificationStatus;
  accountState: string;
  accountBalance: number;
  totalDeposit: number;
  totalWithdrawal: number;
  totalProfit: number;
  bonusBalance: number;
  activePlans: number;
  pendingItems: number;
  isInvestor: boolean;
  approvedDepositCount: number;
  approvedDepositTotal: number;
  lastDepositAt: string | null;
};

export type CelebrityCoupon = {
  id: string;
  celebrityName: string;
  couponCode: string;
  offerDetails: string | null;
  status: CelebrityCouponStatus;
  expiresAt: string | null;
  maxRedemptions: number | null;
  currentRedemptions: number;
  remainingRedemptions: number | null;
  lastRedeemedAt: string | null;
  createdAt: string;
  createdBy: string;
};

export type EmailVerificationChallenge = {
  id: string;
  userId: string;
  email: string;
  code: string;
  expiresAt: string;
  createdAt: string;
};

export type PhoneVerificationChallenge = {
  id: string;
  userId: string;
  phone: string;
  code: string;
  expiresAt: string;
  createdAt: string;
};

export type ConsumeRateLimitInput = {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitConsumptionResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

export type CreateUserInput = {
  username: string;
  role?: UserRole;
  name: string;
  email: string;
  phone: string;
  country: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  coupon?: string | null;
  accountStatus?: AccountStatus;
};

export type CreatePendingRegistrationInput = {
  username: string;
  role?: UserRole;
  name: string;
  email: string;
  phone: string;
  country: string;
  password: string;
  coupon?: string | null;
  verificationChannel: VerificationChannel;
};

export type PendingRegistrationChallenge = {
  pendingRegistrationId: string;
  channel: VerificationChannel;
  destination: string;
  code: string;
  expiresAt: string;
  createdAt: string;
};

export type CreateContactSubmissionInput = {
  topic: string;
  name: string;
  email: string;
  message: string;
};

export type RegistrationAvailabilityInput = {
  username?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type RegistrationAvailabilityResult = {
  username?: boolean;
  email?: boolean;
  phone?: boolean;
};

export type CreatePaymentSubmissionInput = {
  userId: string;
  userName: string;
  userEmail: string;
  planKey: string;
  planName: string;
  fundingMethod: PaymentSubmissionMethod;
  amount: number;
  assetKey?: string | null;
  assetSymbol?: string | null;
  assetName?: string | null;
  network?: string | null;
  routeAddress?: string | null;
  proofImageDataUrl: string;
  proofFileName: string;
  proofMimeType: string;
  proofNote?: string | null;
};

export type CreateWithdrawalSubmissionInput = {
  userId: string;
  userName: string;
  userEmail: string;
  withdrawalMethod: WithdrawalSubmissionMethod;
  amount: number;
  estimatedFee: number;
  netAmount: number;
  assetKey?: string | null;
  assetSymbol?: string | null;
  assetName?: string | null;
  network?: string | null;
  walletAddress?: string | null;
  walletLabel?: string | null;
  bankHolder?: string | null;
  bankName?: string | null;
  bankRouting?: string | null;
  bankAccount?: string | null;
  bankCountry?: string | null;
  wireBeneficiary?: string | null;
  wireBankName?: string | null;
  wireSwift?: string | null;
  wireIban?: string | null;
  wireCountry?: string | null;
  wireNote?: string | null;
};

export type CreateKycSubmissionInput = {
  userId: string;
  userName: string;
  userEmail: string;
  email: string;
  phone: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  countryOfOrigin: string;
  documentType: KycDocumentType;
  documentImageDataUrl: string;
  documentFileName: string;
  documentMimeType: string;
};

export type CreateCelebrityCouponInput = {
  celebrityName: string;
  couponCode: string;
  offerDetails?: string | null;
  status?: CelebrityCouponStatus;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  createdBy: string;
};

export type ReviewPaymentSubmissionInput = {
  id: string;
  status: Exclude<PaymentSubmissionStatus, 'pending'>;
  reviewedBy: string;
  reviewNote?: string | null;
};

export type ReviewWithdrawalSubmissionInput = {
  id: string;
  status: Exclude<WithdrawalSubmissionStatus, 'pending'>;
  reviewedBy: string;
  reviewNote?: string | null;
};

export type ReviewKycSubmissionInput = {
  id: string;
  status: Exclude<KycSubmissionStatus, 'pending'>;
  reviewedBy: string;
  reviewNote?: string | null;
};

export type PlatformStoreStatus = {
  configuredDriver: ConfiguredPlatformStoreDriver;
  resolvedDriver: PlatformStoreDriver | null;
  fallbackActive: boolean;
  database: {
    configured: boolean;
    connected: boolean;
    lastError: string | null;
  };
};

export interface PlatformStoreAdapter {
  readonly driver: PlatformStoreDriver;
  createUser(input: CreateUserInput): Promise<PublicUser>;
  createPendingRegistration(
    input: CreatePendingRegistrationInput,
  ): Promise<PendingRegistrationChallenge>;
  resendPendingRegistrationChallenge(
    pendingRegistrationId: string,
  ): Promise<PendingRegistrationChallenge>;
  verifyPendingRegistration(
    pendingRegistrationId: string,
    code: string,
  ): Promise<PublicUser>;
  checkRegistrationAvailability(
    input: RegistrationAvailabilityInput,
  ): Promise<RegistrationAvailabilityResult>;
  validateUser(login: string, password: string): Promise<PublicUser | null>;
  createPasswordResetRequest(email: string): Promise<PasswordResetRequest>;
  createEmailVerificationChallenge(
    email: string,
  ): Promise<EmailVerificationChallenge>;
  createPhoneVerificationChallenge(
    phone: string,
  ): Promise<PhoneVerificationChallenge>;
  verifyEmailCode(email: string, code: string): Promise<PublicUser>;
  verifyPhoneCode(phone: string, code: string): Promise<PublicUser>;
  createSession(userId: string, remember: boolean): Promise<PlatformSession>;
  refreshSession(token: string): Promise<PlatformSession | null>;
  getUserBySessionToken(token: string): Promise<PublicUser | null>;
  revokeSession(token: string): Promise<void>;
  listAdminUsers(): Promise<AdminUserProfile[]>;
  updateUserAccountStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<AdminUserProfile>;
  deleteUserAccount(userId: string): Promise<void>;
  listCelebrityCoupons(): Promise<CelebrityCoupon[]>;
  createCelebrityCoupon(
    input: CreateCelebrityCouponInput,
  ): Promise<CelebrityCoupon>;
  validateCelebrityCoupon(code: string): Promise<CelebrityCoupon | null>;
  getDashboardAccount(userId: string): Promise<DashboardAccount>;
  claimPendingDailyInterestEmailDispatch(
    userId: string,
  ): Promise<DailyInterestEmailDispatch>;
  listPaymentSubmissionsForUser(userId: string): Promise<PaymentSubmission[]>;
  listPaymentSubmissions(): Promise<PaymentSubmission[]>;
  createPaymentSubmission(
    input: CreatePaymentSubmissionInput,
  ): Promise<PaymentSubmission>;
  reviewPaymentSubmission(
    input: ReviewPaymentSubmissionInput,
  ): Promise<PaymentSubmission>;
  listWithdrawalSubmissionsForUser(
    userId: string,
  ): Promise<WithdrawalSubmission[]>;
  listWithdrawalSubmissions(): Promise<WithdrawalSubmission[]>;
  createWithdrawalSubmission(
    input: CreateWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission>;
  reviewWithdrawalSubmission(
    input: ReviewWithdrawalSubmissionInput,
  ): Promise<WithdrawalSubmission>;
  listKycSubmissionsForUser(userId: string): Promise<KycSubmission[]>;
  listKycSubmissions(): Promise<KycSubmission[]>;
  createKycSubmission(input: CreateKycSubmissionInput): Promise<KycSubmission>;
  reviewKycSubmission(input: ReviewKycSubmissionInput): Promise<KycSubmission>;
  createContactSubmission(
    input: CreateContactSubmissionInput,
  ): Promise<ContactSubmission>;
  consumeRateLimit(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumptionResult>;
}
