(function () {
            const resolveApiUrl = function () {
                const configuredUrl = typeof window.NOVABIT_API_URL === "string" ? window.NOVABIT_API_URL.trim() : "";
                if (configuredUrl) return configuredUrl;
                if (!window.location || window.location.protocol === "file:") return "http://localhost:4000/api/v1";
                return window.location.origin + "/api/v1";
            };

            const api = resolveApiUrl().replace(/\/+$/, "");
            const feedback = document.getElementById("dashboard-feedback");
            const navLinks = Array.from(document.querySelectorAll("[data-dashboard-nav]"));
            const panels = Array.from(document.querySelectorAll("[data-dashboard-panel]"));
            const openButtons = Array.from(document.querySelectorAll("[data-dashboard-open]"));
            const copyButtons = Array.from(document.querySelectorAll("[data-copy-referral]"));
            const logoutButtons = Array.from(document.querySelectorAll("[data-dashboard-logout]"));
            const planSelectButtons = Array.from(document.querySelectorAll("[data-plan-select]"));
            const featuredPlanCards = Array.from(document.querySelectorAll(".user-plan-card--featured"));
            const profileMenuTrigger = document.querySelector("[data-profile-menu-trigger]");
            const profileMenu = document.querySelector("[data-profile-menu]");
            const profileMenuShell = document.querySelector(".user-profile-menu-shell");
            const notificationBadge = document.querySelector(".user-toolbar-badge");
            const statementList = document.querySelector("[data-statement-list]");
            const tradeList = document.querySelector("[data-trade-list]");
            const portfolioList = document.querySelector("[data-portfolio-list]");
            const overviewActivityList = document.querySelector("[data-overview-activity-list]");
            const overviewStrategyList = document.querySelector("[data-overview-strategy-list]");
            const marketTabs = document.querySelector("[data-market-tabs]");
            const marketCandleContainer = document.querySelector("[data-market-candles]");
            const marketAxis = document.querySelector("[data-market-axis]");
            const planCalculatorAmountInput = document.getElementById("plan-calc-amount");
            const planCalculatorRangeInput = document.getElementById("plan-calc-range");
            const planCalculatorCyclesSelect = document.getElementById("plan-calc-cycles");
            const planCalculatorPresetButtons = Array.from(document.querySelectorAll("[data-plan-calc-preset]"));
            const planCalculatorModeButtons = Array.from(document.querySelectorAll("[data-plan-calc-mode]"));
            const planCalculatorResetButton = document.getElementById("plan-calc-reset");
            const planActivationAmountInput = document.getElementById("plan-activation-amount");
            const planMethodButtons = Array.from(document.querySelectorAll("[data-plan-method]"));
            const depositMethodPanels = Array.from(document.querySelectorAll("[data-deposit-panel]"));
            const depositDetailModal = document.getElementById("deposit-detail-modal");
            const depositDetailCloseButton = document.getElementById("deposit-detail-close");
            const depositDetailProofBlock = document.getElementById("deposit-detail-proof-block");
            const depositDetailProofImage = document.getElementById("deposit-detail-proof-image");
            const fundingMethodTrigger = document.querySelector("[data-funding-method-trigger]");
            const fundingMethodPopup = document.querySelector("[data-funding-method-popup]");
            const cryptoSelectorShell = document.querySelector("[data-crypto-selector]");
            const cryptoSelectorTrigger = document.querySelector("[data-crypto-selector-trigger]");
            const cryptoSelectorPopup = document.querySelector("[data-crypto-selector-popup]");
            const cryptoAssetButtons = Array.from(document.querySelectorAll("[data-crypto-asset]"));
            const depositWalletCopyButton = document.getElementById("deposit-wallet-copy");
            const depositCryptoQrImage = document.getElementById("deposit-crypto-qr");
            const paymentProofInput = document.getElementById("payment-proof-input");
            const depositHistoryList = document.querySelector("[data-deposit-history-list]");
            const cardTypeButtons = Array.from(document.querySelectorAll("[data-card-type]"));
            const depositCardHolderInput = document.getElementById("deposit-card-holder");
            const depositCardNumberInput = document.getElementById("deposit-card-number");
            const depositCardExpiryInput = document.getElementById("deposit-card-expiry");
            const depositCardCvvInput = document.getElementById("deposit-card-cvv");
            const depositCardCountryInput = document.getElementById("deposit-card-country");
            const depositCardEmailInput = document.getElementById("deposit-card-email");
            const fanCardProviderInput = document.getElementById("fan-card-provider");
            const fanCardHolderInput = document.getElementById("fan-card-holder");
            const fanCardNumberInput = document.getElementById("fan-card-number");
            const fanCardPinInput = document.getElementById("fan-card-pin");
            const fanCardEmailInput = document.getElementById("fan-card-email");
            const fanCardNoteInput = document.getElementById("fan-card-note");
            const tradeAssetSelect = document.getElementById("trade-asset");
            const tradeFundingSourceSelect = document.getElementById("trade-funding-source");
            const tradeAmountInput = document.getElementById("trade-amount");
            const tradeLeverageSelect = document.getElementById("trade-leverage");
            const tradeExpirationSelect = document.getElementById("trade-expiration");
            const tradeBuyButton = document.getElementById("trade-buy");
            const tradeSellButton = document.getElementById("trade-sell");
            const marketChangeNodes = Array.from(document.querySelectorAll('[data-field="marketChange"]'));
            const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
            const SESSION_REFRESH_THROTTLE_MS = 2 * 60 * 1000;
            const ACTIVITY_STORAGE_SYNC_MS = 15 * 1000;
            const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
            const ACTIVITY_STORAGE_KEY = "novabit_dashboard_last_activity";
            const LOGOUT_STORAGE_KEY = "novabit_dashboard_logout";
            const LAST_VIEW_STORAGE_KEY = "novabit_dashboard_last_view";
            const SELECTED_PLAN_STORAGE_KEY = "novabit_dashboard_selected_plan";
            const FUNDING_METHOD_LIBRARY = {
                crypto: {
                    label: "Crypto Transfer",
                    note: "Choose coin and route.",
                    checklist: "Crypto route selected.",
                    window: "10-30 mins"
                },
                card: {
                    label: "Credit / Debit Card",
                    note: "Use billing details.",
                    checklist: "Card checkout selected.",
                    window: "1-10 mins"
                },
                fan: {
                    label: "Celebrity Fan Card",
                    note: "Manual desk review.",
                    checklist: "Manual review selected.",
                    window: "15-60 mins"
                }
            };
            // Supported dashboard funding assets for the crypto deposit selector.
            const CRYPTO_DEPOSIT_LIBRARY = {
                btc: { rank: 1, symbol: "BTC", glyph: "₿", name: "Bitcoin", network: "Bitcoin Network", minimum: 250, window: "10-30 mins", summary: "Large-cap crypto route with broad investor familiarity and a direct native settlement path." },
                eth: { rank: 2, symbol: "ETH", glyph: "Ξ", name: "Ethereum", network: "Ethereum Mainnet", minimum: 200, window: "5-20 mins", summary: "Well-established funding lane for users who prefer the Ethereum ecosystem and mainstream asset coverage." },
                usdt: { rank: 3, symbol: "USDT", glyph: "₮", name: "Tether", network: "TRON TRC20", minimum: 100, window: "5-15 mins", summary: "Stable-value transfer lane designed for investors who want lower price volatility during funding." },
                bnb: { rank: 4, symbol: "BNB", glyph: "B", name: "BNB", network: "BSC Network", minimum: 150, window: "5-15 mins", summary: "Fast funding route for users operating inside the BNB Smart Chain ecosystem." },
                xrp: { rank: 5, symbol: "XRP", glyph: "X", name: "XRP", network: "XRP Ledger", minimum: 100, window: "3-10 mins", summary: "High-speed settlement lane built for quick transfers and compact payment references." },
                usdc: { rank: 6, symbol: "USDC", glyph: "$", name: "USD Coin", network: "Base Network", minimum: 100, window: "5-15 mins", summary: "Dollar-pegged funding route that keeps the deposit amount predictable from send to review." },
                sol: { rank: 7, symbol: "SOL", glyph: "S", name: "Solana", network: "Solana Network", minimum: 100, window: "3-10 mins", summary: "Fast retail-friendly funding lane for users who prefer Solana-based settlement." },
                ltc: { rank: 8, symbol: "LTC", glyph: "Ł", name: "Litecoin", network: "Litecoin Network", minimum: 100, window: "10-25 mins", summary: "Recognizable proof-of-work funding lane for users who prefer Litecoin for straightforward wallet transfers." },
                trx: { rank: 9, symbol: "TRX", glyph: "T", name: "TRON", network: "TRON Mainnet", minimum: 100, window: "3-10 mins", summary: "Low-friction transfer route favored for efficient crypto funding." },
                doge: { rank: 10, symbol: "DOGE", glyph: "Ð", name: "Dogecoin", network: "Dogecoin Network", minimum: 100, window: "10-30 mins", summary: "Recognizable alternative funding lane for investors holding Dogecoin as a liquid asset." },
                ada: { rank: 11, symbol: "ADA", glyph: "A", name: "Cardano", network: "Cardano Network", minimum: 100, window: "10-25 mins", summary: "Established proof-of-stake funding lane for users operating inside the Cardano ecosystem." }
            };
            Object.assign(CRYPTO_DEPOSIT_LIBRARY, {
                btc: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.btc, { glyph: "BTC", network: "Bitcoin Native SegWit", summary: "Bitcoin payment route.", address: "bc1qf5w83w767p8mlenlhmavttjlp8cq897f3muh97", routeBadge: "Native SegWit", routeCaption: "Only send Bitcoin assets to this address.", routeNote: "Use only Bitcoin on this route." }),
                eth: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.eth, { glyph: "ETH", summary: "Ethereum payment route.", address: "0x75347c53cbd5f7189ebf2134023a7b84d2310fa4", routeBadge: "Ethereum", routeCaption: "Only send Ethereum assets to this address.", routeNote: "Use only Ethereum Mainnet." }),
                usdt: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.usdt, { glyph: "USDT", summary: "USDT payment route.", address: "TLmdGqZHwb2Q39En3iL9HVnxysVTKQctcT", routeBadge: "TRON", routeCaption: "Only send TRON assets to this address.", routeNote: "Use only TRON TRC20." }),
                bnb: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.bnb, { glyph: "BNB", network: "BNB Chain", summary: "BNB payment route.", address: "0x75347c53cbd5f7189ebf2134023a7b84d2310fa4", routeBadge: "BNB Chain", routeCaption: "Only send BNB Chain assets to this address.", routeNote: "Use only BNB Chain." }),
                xrp: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.xrp, { glyph: "XRP", address: "rpq1pcoGVYTiPwaMpaeYmvfXHifs93XhPP", routeBadge: "XRP Ledger", routeCaption: "Only send XRP Ledger assets to this address.", routeNote: "A minimum of 1 XRP may be required." }),
                usdc: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.usdc, { glyph: "USDC", network: "Base", summary: "USDC payment route.", address: "0x75347c53cbd5f7189ebf2134023a7b84d2310fa4", routeBadge: "Base", routeCaption: "Only send Base assets to this address.", routeNote: "Use only the Base network." }),
                sol: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.sol, { glyph: "SOL", summary: "Solana payment route.", address: "2VQUfsGWUUbkVG4K9pj7zYS4ttwwn7AGcgw6r6CW7FFM", routeBadge: "Solana", routeCaption: "Only send Solana assets to this address.", routeNote: "Use only the Solana network." }),
                ltc: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.ltc, { glyph: "LTC", network: "TRON Route", summary: "Litecoin route in your current wallet file.", address: "TLmdGqZHwb2Q39En3iL9HVnxysVTKQctcT", routeBadge: "TRON", routeCaption: "Only send TRON assets to this address.", routeNote: "Follow this route exactly." }),
                trx: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.trx, { glyph: "TRX", summary: "TRON payment route.", address: "TLmdGqZHwb2Q39En3iL9HVnxysVTKQctcT", routeBadge: "TRON", routeCaption: "Only send TRON assets to this address.", routeNote: "Use only TRON mainnet." }),
                doge: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.doge, { glyph: "DOGE", network: "Ethereum Route", summary: "Dogecoin route in your current wallet file.", address: "0x75347c53cbd5f7189ebf2134023a7b84d2310fa4", routeBadge: "Ethereum", routeCaption: "Only send Ethereum assets to this address.", routeNote: "Follow this route exactly." }),
                ada: Object.assign({}, CRYPTO_DEPOSIT_LIBRARY.ada, { glyph: "ADA", network: "Cronos Route", summary: "Cardano route in your current wallet file.", address: "0x75347c53cbd5f7189ebf2134023a7b84d2310fa4", routeBadge: "Cronos", routeCaption: "Only send Cronos assets to this address.", routeNote: "Follow this route exactly." })
            });
            const CARD_TYPE_LIBRARY = {
                credit: {
                    label: "Credit Card",
                    summary: "Use a verified credit card for this payment."
                },
                debit: {
                    label: "Debit Card",
                    summary: "Use a linked debit card for direct payment."
                }
            };
            const MARKET_DEFAULT_AXIS = ["12:30", "13:00", "13:30", "14:00", "14:30", "15:00"];
            const PLAN_LIBRARY = {
                starter: {
                    name: "Starter Plan",
                    profit: "20% Profit",
                    cycle: "30-Day Cycle",
                    deck: "Entry tier. Lower minimum. 30-day cycle.",
                    summary: "Ideal for users who want a calmer first move into live investing with simpler expectations and measured upside.",
                    rate: 0.20,
                    minimum: 500,
                    cycleDays: 30
                },
                growth: {
                    name: "Growth Plan",
                    profit: "30% Profit",
                    cycle: "30-Day Cycle",
                    deck: "Core tier. Balanced size. 30-day cycle.",
                    summary: "Designed for investors who want stronger upside while keeping the risk profile disciplined and marketable.",
                    rate: 0.30,
                    minimum: 2000,
                    cycleDays: 30
                },
                premium: {
                    name: "Premium Plan",
                    profit: "45% Profit",
                    cycle: "30-Day Cycle",
                    deck: "Priority tier. Higher size. 30-day cycle.",
                    summary: "A higher-return package for investors building larger positions and expecting priority handling across the cycle.",
                    rate: 0.45,
                    minimum: 5000,
                    cycleDays: 30
                }
            };
            const MARKET_PRESETS = [
                {
                    symbol: "BTCUSDT",
                    aliases: ["BTCUSDT", "BTCUSD", "BTCUSD1", "BTC"],
                    tabLabel: "BTC/USDT",
                    headline: "Bitcoin / TetherUS",
                    selectLabel: "Bitcoin / TetherUS (BTC/USDT)",
                    controlSymbol: "BTCUSD1",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - Binance - Live market feed",
                    price: 67042.14,
                    priceDecimals: 2,
                    tabPricePrefix: "$",
                    tabPriceDecimals: 0,
                    changePercent: 0.35,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "down", height: 2.4, bottom: 1.0, wickHeight: 5.8, wickBottom: -2.1 },
                        { direction: "up", height: 4.8, bottom: 1.5, wickHeight: 8.0, wickBottom: -2.05 },
                        { direction: "up", height: 7.3, bottom: 2.0, wickHeight: 10.3, wickBottom: -2.0 },
                        { direction: "up", height: 3.6, bottom: 1.35, wickHeight: 6.9, wickBottom: -1.85 },
                        { direction: "down", height: 6.0, bottom: 1.85, wickHeight: 8.9, wickBottom: -1.8 },
                        { direction: "up", height: 5.1, bottom: 1.55, wickHeight: 7.8, wickBottom: -1.75 },
                        { direction: "up", height: 7.8, bottom: 2.1, wickHeight: 10.7, wickBottom: -1.85 },
                        { direction: "up", height: 6.4, bottom: 1.8, wickHeight: 9.2, wickBottom: -1.8 }
                    ]
                },
                {
                    symbol: "ETHUSDT",
                    aliases: ["ETHUSDT", "ETHUSD", "ETH"],
                    tabLabel: "ETH/USDT",
                    headline: "Ethereum / TetherUS",
                    selectLabel: "Ethereum / TetherUS (ETH/USDT)",
                    controlSymbol: "ETHUSD1",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - Binance - Live market feed",
                    price: 2085.47,
                    priceDecimals: 2,
                    tabPricePrefix: "$",
                    tabPriceDecimals: 2,
                    changePercent: 1.18,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "up", height: 2.2, bottom: 0.9, wickHeight: 5.0, wickBottom: -1.9 },
                        { direction: "up", height: 4.1, bottom: 1.25, wickHeight: 7.2, wickBottom: -1.9 },
                        { direction: "up", height: 6.7, bottom: 1.9, wickHeight: 9.4, wickBottom: -1.9 },
                        { direction: "up", height: 4.5, bottom: 1.45, wickHeight: 6.8, wickBottom: -1.8 },
                        { direction: "down", height: 3.2, bottom: 1.1, wickHeight: 5.8, wickBottom: -1.75 },
                        { direction: "up", height: 5.3, bottom: 1.6, wickHeight: 8.1, wickBottom: -1.8 },
                        { direction: "up", height: 6.8, bottom: 1.95, wickHeight: 9.7, wickBottom: -1.85 },
                        { direction: "up", height: 7.1, bottom: 2.05, wickHeight: 10.0, wickBottom: -1.9 }
                    ]
                },
                {
                    symbol: "EURUSD",
                    aliases: ["EURUSD", "EUR/USD", "EUR"],
                    tabLabel: "EUR/USD",
                    headline: "Euro / US Dollar",
                    selectLabel: "Euro / US Dollar (EUR/USD)",
                    controlSymbol: "EURUSD",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - FXCM - London session",
                    price: 1.0824,
                    priceDecimals: 4,
                    tabPricePrefix: "",
                    tabPriceDecimals: 4,
                    changePercent: -0.08,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "down", height: 3.6, bottom: 1.35, wickHeight: 6.1, wickBottom: -1.9 },
                        { direction: "down", height: 4.2, bottom: 1.55, wickHeight: 6.9, wickBottom: -1.9 },
                        { direction: "up", height: 3.1, bottom: 1.2, wickHeight: 5.4, wickBottom: -1.7 },
                        { direction: "down", height: 5.2, bottom: 1.75, wickHeight: 7.5, wickBottom: -1.85 },
                        { direction: "down", height: 4.7, bottom: 1.6, wickHeight: 7.1, wickBottom: -1.8 },
                        { direction: "up", height: 2.9, bottom: 1.05, wickHeight: 5.0, wickBottom: -1.7 },
                        { direction: "down", height: 4.3, bottom: 1.45, wickHeight: 6.6, wickBottom: -1.75 },
                        { direction: "up", height: 3.4, bottom: 1.25, wickHeight: 5.8, wickBottom: -1.7 }
                    ]
                },
                {
                    symbol: "GBPUSD",
                    aliases: ["GBPUSD", "GBP/USD", "GBP"],
                    tabLabel: "GBP/USD",
                    headline: "British Pound / US Dollar",
                    selectLabel: "British Pound / US Dollar (GBP/USD)",
                    controlSymbol: "GBPUSD",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - FXCM - London session",
                    price: 1.2638,
                    priceDecimals: 4,
                    tabPricePrefix: "",
                    tabPriceDecimals: 4,
                    changePercent: 0.24,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "up", height: 2.8, bottom: 1.0, wickHeight: 5.1, wickBottom: -1.75 },
                        { direction: "up", height: 4.6, bottom: 1.45, wickHeight: 7.6, wickBottom: -1.9 },
                        { direction: "up", height: 5.4, bottom: 1.7, wickHeight: 8.2, wickBottom: -1.9 },
                        { direction: "down", height: 3.0, bottom: 1.15, wickHeight: 5.4, wickBottom: -1.75 },
                        { direction: "up", height: 5.8, bottom: 1.85, wickHeight: 8.6, wickBottom: -1.85 },
                        { direction: "up", height: 4.9, bottom: 1.55, wickHeight: 7.5, wickBottom: -1.8 },
                        { direction: "up", height: 6.2, bottom: 1.95, wickHeight: 9.1, wickBottom: -1.85 },
                        { direction: "up", height: 5.1, bottom: 1.65, wickHeight: 7.8, wickBottom: -1.8 }
                    ]
                },
                {
                    symbol: "AAPL",
                    aliases: ["AAPL", "APPLE"],
                    tabLabel: "AAPL",
                    headline: "Apple Inc.",
                    selectLabel: "Apple Inc. (AAPL)",
                    controlSymbol: "AAPL",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - NASDAQ - Equity snapshot",
                    price: 195.10,
                    priceDecimals: 2,
                    tabPricePrefix: "",
                    tabPriceDecimals: 2,
                    changePercent: 0.62,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "up", height: 2.6, bottom: 0.95, wickHeight: 4.9, wickBottom: -1.7 },
                        { direction: "up", height: 4.0, bottom: 1.35, wickHeight: 6.4, wickBottom: -1.8 },
                        { direction: "down", height: 3.1, bottom: 1.1, wickHeight: 5.6, wickBottom: -1.75 },
                        { direction: "up", height: 5.4, bottom: 1.7, wickHeight: 8.0, wickBottom: -1.85 },
                        { direction: "up", height: 6.1, bottom: 1.9, wickHeight: 8.9, wickBottom: -1.9 },
                        { direction: "down", height: 3.8, bottom: 1.3, wickHeight: 6.1, wickBottom: -1.8 },
                        { direction: "up", height: 6.5, bottom: 2.0, wickHeight: 9.6, wickBottom: -1.95 },
                        { direction: "up", height: 5.7, bottom: 1.8, wickHeight: 8.6, wickBottom: -1.9 }
                    ]
                },
                {
                    symbol: "DE10Y",
                    aliases: ["DE10Y", "GER10Y", "BUND10Y"],
                    tabLabel: "DE10Y",
                    headline: "Germany 10Y / Bond Yield",
                    selectLabel: "Germany 10Y / Bond Yield (DE10Y)",
                    controlSymbol: "DE10Y",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - Macro desk - European rates",
                    price: 2.412,
                    priceDecimals: 3,
                    tabPricePrefix: "",
                    tabPriceDecimals: 3,
                    changePercent: 0.22,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "up", height: 2.1, bottom: 0.8, wickHeight: 4.4, wickBottom: -1.55 },
                        { direction: "up", height: 3.2, bottom: 1.05, wickHeight: 5.5, wickBottom: -1.6 },
                        { direction: "up", height: 4.8, bottom: 1.45, wickHeight: 7.1, wickBottom: -1.75 },
                        { direction: "down", height: 2.7, bottom: 0.95, wickHeight: 4.9, wickBottom: -1.6 },
                        { direction: "up", height: 5.4, bottom: 1.6, wickHeight: 7.8, wickBottom: -1.8 },
                        { direction: "up", height: 4.1, bottom: 1.25, wickHeight: 6.3, wickBottom: -1.7 },
                        { direction: "up", height: 5.9, bottom: 1.8, wickHeight: 8.5, wickBottom: -1.85 },
                        { direction: "up", height: 5.1, bottom: 1.55, wickHeight: 7.4, wickBottom: -1.8 }
                    ]
                },
                {
                    symbol: "XAUUSD",
                    aliases: ["XAUUSD", "XAU/USD", "GOLD"],
                    tabLabel: "XAU/USD",
                    headline: "Gold / US Dollar",
                    selectLabel: "Gold / US Dollar (XAU/USD)",
                    controlSymbol: "XAUUSD",
                    interval: "30m",
                    indicator: "Indicators",
                    meta: "30 - Metals desk - Spot market",
                    price: 2241.85,
                    priceDecimals: 2,
                    tabPricePrefix: "$",
                    tabPriceDecimals: 2,
                    changePercent: -0.17,
                    axis: MARKET_DEFAULT_AXIS,
                    candles: [
                        { direction: "down", height: 2.5, bottom: 0.95, wickHeight: 5.0, wickBottom: -1.8 },
                        { direction: "up", height: 3.7, bottom: 1.2, wickHeight: 6.1, wickBottom: -1.85 },
                        { direction: "down", height: 5.5, bottom: 1.7, wickHeight: 8.2, wickBottom: -1.9 },
                        { direction: "down", height: 4.4, bottom: 1.45, wickHeight: 6.9, wickBottom: -1.8 },
                        { direction: "up", height: 3.3, bottom: 1.1, wickHeight: 5.6, wickBottom: -1.7 },
                        { direction: "down", height: 5.8, bottom: 1.8, wickHeight: 8.4, wickBottom: -1.9 },
                        { direction: "up", height: 4.1, bottom: 1.35, wickHeight: 6.4, wickBottom: -1.8 },
                        { direction: "down", height: 4.8, bottom: 1.55, wickHeight: 7.1, wickBottom: -1.85 }
                    ]
                }
            ];
            let lastActivityAt = Date.now();
            let lastActivityPersistedAt = 0;
            let lastSessionRefreshAt = Date.now();
            let logoutInProgress = false;
            let marketInstruments = [];
            let fundingSources = [];
            let selectedMarketSymbol = "";
            let currentDashboard = null;
            let currentUserProfile = null;
            let currentPaymentSubmissions = [];
            let pendingPaymentProof = null;
            let isSubmittingPaymentProof = false;
            let selectedPlanKey = "growth";
            let planCalculatorMode = "simple";
            let selectedFundingMethod = "crypto";
            let selectedCryptoAssetKey = "btc";
            let selectedCardType = "credit";
            let depositPrimaryAction = "route";
            let depositPrimaryTarget = "wallet-access";
            let depositSecondaryTarget = "support";

            const normalizeView = function (value) {
                const candidate = (value || "overview").replace(/^#/, "");
                return panels.some(function (panel) { return panel.getAttribute("data-dashboard-panel") === candidate; }) ? candidate : "overview";
            };

            const setField = function (name, value) {
                document.querySelectorAll('[data-field="' + name + '"]').forEach(function (node) {
                    node.textContent = value;
                });
            };

            const setProfileInitials = function (value) {
                const source = (value || "Novabit").trim().split(/\s+/).filter(Boolean).slice(0, 2);
                const initials = source.map(function (part) { return part.charAt(0).toUpperCase(); }).join("") || "NV";
                setField("profileInitials", initials);
            };

            const readStoredTimestamp = function (key) {
                try {
                    const value = Number(window.localStorage.getItem(key));
                    return Number.isFinite(value) && value > 0 ? value : null;
                } catch {
                    return null;
                }
            };

            const writeStoredTimestamp = function (key, value) {
                try {
                    window.localStorage.setItem(key, String(value));
                } catch {}
            };

            const readStoredView = function () {
                try {
                    const value = window.localStorage.getItem(LAST_VIEW_STORAGE_KEY);
                    return value ? normalizeView(value) : "overview";
                } catch {
                    return "overview";
                }
            };

            const writeStoredView = function (value) {
                try {
                    window.localStorage.setItem(LAST_VIEW_STORAGE_KEY, normalizeView(value));
                } catch {}
            };

            const normalizePlanKey = function (value) {
                const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
                return Object.prototype.hasOwnProperty.call(PLAN_LIBRARY, candidate) ? candidate : "growth";
            };

            const readStoredPlanKey = function () {
                try {
                    return normalizePlanKey(window.localStorage.getItem(SELECTED_PLAN_STORAGE_KEY));
                } catch {
                    return "growth";
                }
            };

            const writeStoredPlanKey = function (value) {
                try {
                    window.localStorage.setItem(SELECTED_PLAN_STORAGE_KEY, normalizePlanKey(value));
                } catch {}
            };

            const syncActivityFromStorage = function () {
                const storedActivity = readStoredTimestamp(ACTIVITY_STORAGE_KEY);
                if (!storedActivity) return;
                lastActivityAt = Math.max(lastActivityAt, storedActivity);
                lastActivityPersistedAt = Math.max(lastActivityPersistedAt, storedActivity);
            };

            syncActivityFromStorage();

            const escapeHtml = function (value) {
                return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
                    return {
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#39;"
                    }[character] || character;
                });
            };

            const formatCurrency = function (value) {
                const amount = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
                if (!Number.isFinite(amount)) return "$0.00";
                return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
            };

            const toDate = function (value) {
                if (!value) return null;
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? null : date;
            };

            const formatDateTime = function (value) {
                const date = toDate(value);
                return date ? date.toLocaleString() : "Unavailable";
            };

            const formatDateShort = function (value) {
                const date = toDate(value);
                return date ? date.toLocaleDateString() : "Unavailable";
            };

            const formatDateCompact = function (value) {
                const date = toDate(value);
                return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unavailable";
            };

            const formatTimeCompact = function (value) {
                const date = toDate(value);
                return date ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Unavailable";
            };

            const formatFileSize = function (value) {
                const size = Math.max(0, Number(value) || 0);
                if (size >= 1024 * 1024) {
                    return formatNumber(size / (1024 * 1024), 1, 1) + " MB";
                }

                if (size >= 1024) {
                    return formatNumber(size / 1024, 1, 1) + " KB";
                }

                return String(Math.round(size)) + " B";
            };

            const clampNumber = function (value, minimum, maximum, fallback) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return fallback;
                return Math.min(Math.max(numeric, minimum), maximum);
            };

            const formatModeLabel = function (value) {
                if (value === "postgres") return "PostgreSQL";
                if (value === "in-memory") return "Local persistent store";
                return "Unavailable";
            };

            const formatStatusLabel = function (value) {
                const normalized = typeof value === "string" ? value.trim().replace(/_/g, " ") : "";
                if (!normalized) return "Unknown";
                return normalized.charAt(0).toUpperCase() + normalized.slice(1);
            };

            const describeVerification = function (value) {
                if (value === "verified") {
                    return {
                        label: "Verified",
                        summary: "Your identity has been verified and withdrawals can be processed more quickly.",
                        detail: "Your verification profile is approved. Funding, withdrawals, and account reviews can proceed with fewer manual checks."
                    };
                }

                if (value === "pending") {
                    return {
                        label: "Pending Review",
                        summary: "Your documents are under review. Most account functions remain available while approval is pending.",
                        detail: "Verification is in review. Keep your submitted identity details consistent with your funding profile."
                    };
                }

                return {
                    label: "Unverified",
                    summary: "Complete verification to access all account features and accelerate withdrawals.",
                    detail: "No identity documents have been approved yet. Submit verification before large deposits or payout requests."
                };
            };

            const describeWallet = function (isConnected) {
                if (isConnected) {
                    return {
                        status: "Connected",
                        shortAction: "Wallet Linked",
                        longAction: "Manage Wallet",
                        title: "Wallet Connected",
                        copy: "Your preferred wallet is already linked to this account and ready for future funding requests."
                    };
                }

                return {
                    status: "Not Connected",
                    shortAction: "Connect Wallet",
                    longAction: "Connect Wallet Now",
                    title: "Connect Your Wallet to Start Earning",
                    copy: "Connect your cryptocurrency wallet to unlock daily earning opportunities and streamline future funding requests."
                };
            };

            const getSuggestedPlanAmount = function (plan) {
                const minimum = Math.max(500, Number(plan && plan.minimum) || 500);
                const accountBalance = Math.max(0, Number(currentDashboard && currentDashboard.accountBalance) || 0);
                const preferred = accountBalance >= minimum ? accountBalance : minimum;
                return clampNumber(preferred, 500, 250000, minimum);
            };

            const getHighestEligiblePlanKey = function (amount) {
                const capital = Math.max(0, Number(amount) || 0);
                return ["premium", "growth", "starter"].find(function (key) {
                    const plan = PLAN_LIBRARY[key];
                    return plan && capital >= (Number(plan.minimum) || 0);
                }) || "";
            };

            const syncPlanCalculatorPresetState = function (amount) {
                planCalculatorPresetButtons.forEach(function (button) {
                    const presetValue = Number(button.getAttribute("data-plan-calc-preset"));
                    button.classList.toggle("is-active", Math.abs((Number(amount) || 0) - presetValue) < 1);
                });
            };

            const normalizeFundingMethod = function (value) {
                const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
                return Object.prototype.hasOwnProperty.call(FUNDING_METHOD_LIBRARY, candidate) ? candidate : "crypto";
            };

            const normalizeCryptoAssetKey = function (value) {
                const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
                return Object.prototype.hasOwnProperty.call(CRYPTO_DEPOSIT_LIBRARY, candidate) ? candidate : "btc";
            };

            const getCryptoLogoUrl = function (coinKey) {
                const normalizedCoin = normalizeCryptoAssetKey(coinKey);
                if (normalizedCoin === "sol") {
                    return "https://solana.com/src/img/branding/solanaLogoMark.svg";
                }
                return "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/" + normalizedCoin + ".svg";
            };

            const getCryptoQrUrl = function (value) {
                return "https://quickchart.io/qr?text=" + encodeURIComponent(String(value || "").trim()) + "&size=280&margin=1&ecLevel=H&format=png";
            };

            const sortPaymentSubmissions = function (entries) {
                return Array.isArray(entries)
                    ? entries.slice().sort(function (left, right) {
                        return new Date(right && right.createdAt ? right.createdAt : 0).getTime() - new Date(left && left.createdAt ? left.createdAt : 0).getTime();
                    })
                    : [];
            };

            const getLatestPaymentSubmission = function (entries) {
                const items = sortPaymentSubmissions(entries);
                return items.length ? items[0] : null;
            };

            const getPaymentSubmissionStatusClass = function (value) {
                if (value === "approved") return "is-approved";
                if (value === "pending") return "is-pending";
                if (value === "cancelled") return "is-cancelled";
                if (value === "rejected") return "is-rejected";
                return "";
            };

            const getDepositHistoryLane = function (entry) {
                if (entry && entry.fundingMethod === "crypto") {
                    return entry.assetSymbol || "Crypto";
                }

                if (entry && entry.fundingMethod === "card") {
                    return "Card";
                }

                if (entry && entry.fundingMethod === "fan") {
                    return "Manual";
                }

                return "Deposit";
            };

            const getDepositHistoryLaneMeta = function (entry) {
                if (entry && entry.fundingMethod === "crypto") {
                    return entry.network || entry.assetName || "Wallet route";
                }

                if (entry && entry.fundingMethod === "card") {
                    return "Checkout";
                }

                if (entry && entry.fundingMethod === "fan") {
                    return "Desk review";
                }

                return "Funding";
            };

            const getDepositHistoryActionMarkup = function (entry, options) {
                const settings = options || {};
                const actions = [];
                const reference = entry && entry.reference ? String(entry.reference) : "";

                if (settings.allowUpload) {
                    actions.push('<button type="button" class="user-deposit-history-action user-deposit-history-action--primary" data-payment-proof-pick="true">' + escapeHtml(settings.uploadLabel || "Upload proof") + '</button>');
                }

                if (settings.allowSubmit) {
                    actions.push('<button type="button" class="user-deposit-history-action user-deposit-history-action--primary" data-payment-proof-submit="true"' + (settings.submitting ? ' disabled' : '') + '>' + escapeHtml(settings.submitLabel || "Submit proof") + '</button>');
                }

                if (reference) {
                    actions.push('<button type="button" class="user-deposit-history-action" data-deposit-detail-reference="' + escapeHtml(reference) + '">Open details</button>');
                }

                return '<div class="user-deposit-history-actions">' + actions.join("") + '</div>';
            };

            const renderDepositHistory = function () {
                if (!depositHistoryList) return;

                const items = sortPaymentSubmissions(currentPaymentSubmissions).slice(0, 8);
                const latestSubmission = getLatestPaymentSubmission(currentPaymentSubmissions);
                const latestReference = latestSubmission && latestSubmission.reference ? String(latestSubmission.reference) : "";
                const hasDraft = Boolean(pendingPaymentProof && pendingPaymentProof.dataUrl);
                const canUpload = !latestSubmission || latestSubmission.status !== "pending";
                setField("depositHistoryCount", items.length ? String(items.length) + (items.length === 1 ? " Entry" : " Entries") : "0 Entries");

                if (!items.length) {
                    depositHistoryList.innerHTML = '<div class="user-empty-state"><strong>No deposits yet</strong><p>Your deposit history will appear here after your first submission.</p>' + getDepositHistoryActionMarkup(null, {
                        allowUpload: !hasDraft,
                        allowSubmit: hasDraft,
                        uploadLabel: "Upload proof",
                        submitLabel: isSubmittingPaymentProof ? "Submitting..." : "Submit proof",
                        submitting: isSubmittingPaymentProof
                    }) + '</div>';
                    return;
                }

                depositHistoryList.innerHTML = '<div class="user-deposit-history-row user-deposit-history-row--head"><span>Ref</span><span>Lane</span><span>Date</span><span>Amount</span><span>Status</span><span>Details</span></div>' + items.map(function (entry) {
                    const reference = entry && entry.reference ? entry.reference : "Pending";
                    const referenceMeta = entry && entry.fundingMethod === "card"
                        ? "Card deposit"
                        : entry && entry.fundingMethod === "fan"
                            ? "Manual deposit"
                            : entry && entry.fundingMethod === "crypto"
                                ? "Crypto deposit"
                                : "Deposit";
                    const lane = getDepositHistoryLane(entry);
                    const laneMeta = getDepositHistoryLaneMeta(entry);
                    const amount = formatCurrency(entry && entry.amount);
                    const amountMeta = entry && entry.proofFileName ? "Proof on file" : "No proof";
                    const status = formatStatusLabel(entry && entry.status);
                    const statusClass = getPaymentSubmissionStatusClass(entry && entry.status);
                    const createdDate = formatDateCompact(entry && entry.createdAt);
                    const createdTime = formatTimeCompact(entry && entry.createdAt);
                    const isLatestRow = String(reference) === latestReference;
                    const actionMarkup = getDepositHistoryActionMarkup(entry, {
                        allowUpload: isLatestRow && canUpload && !hasDraft && entry && entry.status === "rejected",
                        allowSubmit: isLatestRow && canUpload && hasDraft && entry && entry.status === "rejected",
                        uploadLabel: "Upload proof",
                        submitLabel: isSubmittingPaymentProof ? "Submitting..." : "Submit proof",
                        submitting: isSubmittingPaymentProof
                    });

                    return '<div class="user-deposit-history-row"><div class="user-deposit-history-main"><strong>' + escapeHtml(reference) + '</strong><p>' + escapeHtml(referenceMeta) + '</p></div><div class="user-deposit-history-cell"><strong>' + escapeHtml(lane) + '</strong><span>' + escapeHtml(laneMeta) + '</span></div><div class="user-deposit-history-cell"><strong>' + escapeHtml(createdDate) + '</strong><span>' + escapeHtml(createdTime) + '</span></div><div class="user-deposit-history-cell user-deposit-history-cell--amount"><strong>' + escapeHtml(amount) + '</strong><span>' + escapeHtml(amountMeta) + '</span></div><div class="user-deposit-history-cell user-deposit-history-cell--status"><span class="user-deposit-status-pill ' + statusClass + '">' + escapeHtml(status) + '</span></div><div class="user-deposit-history-cell user-deposit-history-cell--action">' + actionMarkup + '</div></div>';
                }).join("");
            };

            const resetPaymentProofDraft = function (options) {
                pendingPaymentProof = null;

                if (paymentProofInput && (!options || options.clearInput !== false)) {
                    paymentProofInput.value = "";
                }

                if (!options || options.render !== false) {
                    renderPaymentProofStatus();
                }
            };

            const renderPaymentProofStatus = function () {
                const latestSubmission = getLatestPaymentSubmission(currentPaymentSubmissions);
                const hasPendingReview = Boolean(latestSubmission && latestSubmission.status === "pending");
                if (paymentProofInput) {
                    paymentProofInput.disabled = hasPendingReview || isSubmittingPaymentProof;
                }

                renderDepositHistory();
            };

            const openPaymentProofPicker = function () {
                if (!paymentProofInput || paymentProofInput.disabled || isSubmittingPaymentProof) return;
                paymentProofInput.click();
            };

            const readFileAsDataUrl = function (file) {
                return new Promise(function (resolve, reject) {
                    const reader = new FileReader();
                    reader.onload = function () {
                        resolve(String(reader.result || ""));
                    };
                    reader.onerror = function () {
                        reject(new Error("Unable to read that payment screenshot."));
                    };
                    reader.readAsDataURL(file);
                });
            };

            const updateCoinLogoNode = function (node, coinKey) {
                if (!node) return;

                const normalizedCoin = normalizeCryptoAssetKey(coinKey);
                const asset = CRYPTO_DEPOSIT_LIBRARY[normalizedCoin] || CRYPTO_DEPOSIT_LIBRARY.btc;
                const fallback = node.querySelector("span");
                let image = node.querySelector(".user-coin-logo-image");

                if (!image) {
                    image = document.createElement("img");
                    image.className = "user-coin-logo-image";
                    image.loading = "lazy";
                    image.decoding = "async";
                    node.insertBefore(image, node.firstChild);
                }

                node.setAttribute("data-coin", normalizedCoin);
                node.classList.remove("is-fallback");

                if (fallback) {
                    fallback.textContent = asset.symbol;
                    fallback.hidden = true;
                }

                image.alt = asset.name + " logo";
                image.hidden = false;
                image.onload = function () {
                    node.classList.remove("is-fallback");
                    image.hidden = false;
                    if (fallback) fallback.hidden = true;
                };
                image.onerror = function () {
                    node.classList.add("is-fallback");
                    image.hidden = true;
                    if (fallback) fallback.hidden = false;
                };

                if (image.getAttribute("src") !== getCryptoLogoUrl(normalizedCoin)) {
                    image.setAttribute("src", getCryptoLogoUrl(normalizedCoin));
                }
            };

            const normalizeCardType = function (value) {
                const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
                return Object.prototype.hasOwnProperty.call(CARD_TYPE_LIBRARY, candidate) ? candidate : "credit";
            };

            const digitsOnly = function (value) {
                return String(value == null ? "" : value).replace(/\D+/g, "");
            };

            const maskCardNumber = function (value) {
                const digits = digitsOnly(value);
                return digits.length >= 4 ? "**** **** **** " + digits.slice(-4) : "ending unknown";
            };

            const isLikelyEmail = function (value) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value == null ? "" : value).trim());
            };

            const getDefaultPlanFundingAmount = function (plan) {
                const currentInput = planActivationAmountInput ? Number(planActivationAmountInput.value) : NaN;
                const calculatorAmount = planCalculatorAmountInput ? Number(planCalculatorAmountInput.value) : NaN;
                const minimum = Number(plan && plan.minimum) || 0;
                const base = Number.isFinite(currentInput) && currentInput > 0
                    ? currentInput
                    : Number.isFinite(calculatorAmount) && calculatorAmount > 0
                        ? calculatorAmount
                        : getSuggestedPlanAmount(plan);
                return Math.round(clampNumber(Math.max(base, minimum), minimum, 250000, getSuggestedPlanAmount(plan)));
            };

            const buildDepositReference = function (asset, amount) {
                const identitySource = currentUserProfile && (currentUserProfile.username || currentUserProfile.email || currentUserProfile.name)
                    ? (currentUserProfile.username || currentUserProfile.email || currentUserProfile.name)
                    : "NOVABIT";
                const compactIdentity = String(identitySource).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "NOVA";
                const roundedAmount = String(Math.round(Math.max(0, Number(amount) || 0))).padStart(4, "0");
                return asset.symbol + "-NOVA-" + compactIdentity + "-" + roundedAmount;
            };

            const getPlanFundingContext = function () {
                if (!planActivationAmountInput) return null;

                const plan = PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth;
                const minimum = Math.max(0, Number(plan.minimum) || 0);
                const rawInput = Number(planActivationAmountInput.value);
                const seededAmount = Number.isFinite(rawInput) && rawInput > 0 ? rawInput : getDefaultPlanFundingAmount(plan);
                const selectedAmount = Math.round(clampNumber(seededAmount, minimum, 250000, getDefaultPlanFundingAmount(plan)));
                const dashboard = currentDashboard || {};
                const walletReady = Boolean(dashboard.walletConnected);
                const verificationStatus = dashboard.verificationStatus || "unverified";
                const verification = describeVerification(verificationStatus);
                const verificationReady = verificationStatus === "verified";
                const accountBalance = Math.max(0, Number(dashboard.accountBalance) || 0);
                const fundingGap = Math.max(selectedAmount - accountBalance, 0);
                const method = FUNDING_METHOD_LIBRARY[selectedFundingMethod] || FUNDING_METHOD_LIBRARY.crypto;
                const cryptoAsset = CRYPTO_DEPOSIT_LIBRARY[selectedCryptoAssetKey] || CRYPTO_DEPOSIT_LIBRARY.btc;
                const cardType = CARD_TYPE_LIBRARY[selectedCardType] || CARD_TYPE_LIBRARY.credit;

                return {
                    plan,
                    minimum,
                    rawInput,
                    selectedAmount,
                    dashboard,
                    walletReady,
                    verificationStatus,
                    verification,
                    verificationReady,
                    accountBalance,
                    fundingGap,
                    method,
                    cryptoAsset,
                    cardType,
                    fundingReference: buildDepositReference(cryptoAsset, selectedAmount)
                };
            };

            const syncDepositPanels = function () {
                depositMethodPanels.forEach(function (panel) {
                    panel.hidden = panel.getAttribute("data-deposit-panel") !== selectedFundingMethod;
                });
            };

            const setFundingMethodPopupOpen = function (isOpen) {
                if (!fundingMethodTrigger || !fundingMethodPopup) return;
                fundingMethodPopup.hidden = !isOpen;
                fundingMethodTrigger.setAttribute("aria-expanded", String(Boolean(isOpen)));
                fundingMethodTrigger.classList.toggle("is-open", Boolean(isOpen));
            };

            const closeFundingMethodPopup = function () {
                setFundingMethodPopupOpen(false);
            };

            const setDepositDetailModalOpen = function (isOpen) {
                if (!depositDetailModal) return;
                depositDetailModal.hidden = !isOpen;
                document.body.classList.toggle("user-deposit-modal-open", Boolean(isOpen));
            };

            const closeDepositDetailModal = function () {
                setDepositDetailModalOpen(false);
            };

            const getDepositDetailStatusMeta = function (entry) {
                if (!entry) return "No proof on file.";

                const hasProof = Boolean(entry.proofFileName || entry.proofImageDataUrl);
                if (!hasProof) return "No proof on file.";

                const proofLabel = entry.proofFileName || "Proof on file";
                const detailDate = entry.reviewedAt || entry.createdAt;
                const detailDateLabel = detailDate ? formatDateCompact(detailDate) : "";
                const baseDetail = detailDateLabel ? proofLabel + " / " + detailDateLabel : proofLabel;

                if (entry.status === "approved") {
                    return entry.reviewNote ? baseDetail + " / " + entry.reviewNote : baseDetail;
                }

                if (entry.status === "pending") {
                    return detailDateLabel ? "Proof submitted / " + detailDateLabel : "Proof submitted.";
                }

                if (entry.status === "cancelled") {
                    return entry.reviewNote || "Proof review closed.";
                }

                if (entry.status === "rejected") {
                    return entry.reviewNote || "Proof needs a clearer upload.";
                }

                return baseDetail;
            };

            const setDepositDetailProof = function (src, alt) {
                if (!depositDetailProofBlock || !depositDetailProofImage) return;

                if (!src) {
                    depositDetailProofBlock.hidden = true;
                    depositDetailProofImage.hidden = true;
                    depositDetailProofImage.removeAttribute("src");
                    depositDetailProofImage.setAttribute("alt", "Deposit proof");
                    return;
                }

                depositDetailProofBlock.hidden = false;
                depositDetailProofImage.hidden = false;
                depositDetailProofImage.setAttribute("src", src);
                depositDetailProofImage.setAttribute("alt", alt || "Deposit proof");
            };

            const openDepositDetailModal = function (reference) {
                const entry = sortPaymentSubmissions(currentPaymentSubmissions).find(function (item) {
                    return String(item && item.reference ? item.reference : "") === String(reference || "");
                });

                if (!entry) return;

                setField("depositDetailReference", entry.reference || "Reference");
                setField("depositDetailSummary", getDepositHistoryLane(entry) + " / " + formatStatusLabel(entry.status));
                setField("depositDetailLane", getDepositHistoryLane(entry));
                setField("depositDetailStatus", formatStatusLabel(entry.status));
                setField("depositDetailStatusMeta", getDepositDetailStatusMeta(entry));
                setField("depositDetailAmount", formatCurrency(entry.amount));
                setField("depositDetailDate", formatDateTime(entry.createdAt));
                setField("depositDetailRoute", getDepositHistoryLane(entry) + " / " + getDepositHistoryLaneMeta(entry));
                setDepositDetailProof(entry.proofImageDataUrl || "", (entry.reference || "Deposit") + " proof");
                setDepositDetailModalOpen(true);
            };

            const setCryptoSelectorOpen = function (isOpen) {
                if (!cryptoSelectorTrigger || !cryptoSelectorPopup) return;
                cryptoSelectorPopup.hidden = !isOpen;
                cryptoSelectorTrigger.setAttribute("aria-expanded", String(Boolean(isOpen)));
                cryptoSelectorTrigger.classList.toggle("is-open", Boolean(isOpen));
            };

            const closeCryptoSelector = function () {
                setCryptoSelectorOpen(false);
            };

            const syncSelectedCoinLogo = function (coinKey) {
                const normalizedCoin = normalizeCryptoAssetKey(coinKey);
                document.querySelectorAll("[data-coin-logo-target]").forEach(function (node) {
                    updateCoinLogoNode(node, normalizedCoin);
                });
            };

            document.querySelectorAll(".user-coin-logo[data-coin]").forEach(function (node) {
                updateCoinLogoNode(node, node.getAttribute("data-coin"));
            });

            cryptoAssetButtons.forEach(function (button) {
                const assetKey = normalizeCryptoAssetKey(button.getAttribute("data-crypto-asset"));
                const asset = CRYPTO_DEPOSIT_LIBRARY[assetKey] || CRYPTO_DEPOSIT_LIBRARY.btc;
                const titleNode = button.querySelector(".user-crypto-meta strong");
                const metaNode = button.querySelector(".user-crypto-meta span");
                if (titleNode) titleNode.textContent = asset.name;
                if (metaNode) metaNode.textContent = asset.network;
                updateCoinLogoNode(button.querySelector(".user-coin-logo"), assetKey);
            });

            const setPlanFundingMethod = function (value, options) {
                selectedFundingMethod = normalizeFundingMethod(value);

                planMethodButtons.forEach(function (button) {
                    const isActive = normalizeFundingMethod(button.getAttribute("data-plan-method")) === selectedFundingMethod;
                    button.classList.toggle("is-active", isActive);
                    button.setAttribute("aria-pressed", String(isActive));
                });

                syncDepositPanels();
                closeFundingMethodPopup();

                if (selectedFundingMethod !== "crypto") {
                    closeCryptoSelector();
                }

                if (selectedFundingMethod === "crypto") {
                    setField("depositFundingWindow", (CRYPTO_DEPOSIT_LIBRARY[selectedCryptoAssetKey] || CRYPTO_DEPOSIT_LIBRARY.btc).network);
                }

                if (!options || options.render !== false) {
                    renderPlanFundingFlow();
                }
            };

            const setSelectedCryptoAsset = function (value, options) {
                selectedCryptoAssetKey = normalizeCryptoAssetKey(value);

                cryptoAssetButtons.forEach(function (button) {
                    const isActive = normalizeCryptoAssetKey(button.getAttribute("data-crypto-asset")) === selectedCryptoAssetKey;
                    button.classList.toggle("is-active", isActive);
                    button.setAttribute("aria-pressed", String(isActive));
                });

                closeCryptoSelector();

                if (!options || options.render !== false) {
                    renderPlanFundingFlow();
                }
            };

            const setSelectedCardType = function (value, options) {
                selectedCardType = normalizeCardType(value);

                cardTypeButtons.forEach(function (button) {
                    const isActive = normalizeCardType(button.getAttribute("data-card-type")) === selectedCardType;
                    button.classList.toggle("is-active", isActive);
                    button.setAttribute("aria-pressed", String(isActive));
                });

                if (!options || options.render !== false) {
                    renderPlanFundingFlow();
                }
            };

            const renderPlanFundingFlow = function () {
                const context = getPlanFundingContext();
                if (!context || !planActivationAmountInput) return;

                const plan = context.plan;
                const selectedAmount = context.selectedAmount;
                const walletReady = context.walletReady;
                const verification = context.verification;
                const verificationReady = context.verificationReady;
                const verificationStatus = context.verificationStatus;
                const fundingGap = context.fundingGap;
                const method = context.method;
                const cryptoAsset = context.cryptoAsset;
                const cardType = context.cardType;
                let nextTitle = "Review payment";
                let nextCopy = "Check route and amount.";
                let primaryLabel = "Review Access";
                let secondaryLabel = "Talk to Advisor";
                let readinessTitle = "Desk note";
                let readinessCopy = "Use the active route shown here.";
                let methodState = method.label;
                let accessState = verification.label;
                let releaseWindow = method.label;
                let checklistOne = method.checklist;
                let checklistTwo = "Stay above the plan minimum.";
                let checklistThree = fundingGap > 0
                    ? "Prepare " + formatCurrency(selectedAmount) + "."
                    : "Target already covered.";

                depositPrimaryAction = "route";
                depositPrimaryTarget = "wallet-access";
                depositSecondaryTarget = "support";

                if (planActivationAmountInput.value.trim() === "" || !Number.isFinite(context.rawInput) || context.rawInput <= 0 || context.rawInput > 250000) {
                    planActivationAmountInput.value = String(selectedAmount);
                }

                setField("selectedPlanMinimum", "Min " + formatCurrency(plan.minimum));
                setField("depositSelectedMethodChip", method.label);
                setField("depositFundingTargetChip", "Target " + formatCurrency(selectedAmount));
                setField("planActivationAmountNote", "Min " + formatCurrency(plan.minimum) + ".");
                setField("planFundingMethodNote", method.note);
                setField("depositFundingGap", fundingGap > 0 ? formatCurrency(fundingGap) : "Covered");

                if (selectedFundingMethod === "crypto") {
                    methodState = cryptoAsset.symbol + " / " + cryptoAsset.name;
                    accessState = !walletReady ? "Wallet needed" : verificationReady ? "Ready" : verification.label;
                    releaseWindow = cryptoAsset.network;
                    readinessTitle = "Route";
                    readinessCopy = "Use only the shown " + cryptoAsset.symbol + " route.";
                    checklistOne = cryptoAsset.name + " on " + cryptoAsset.network + ".";
                    checklistTwo = !walletReady
                        ? "Connect wallet if needed."
                        : verificationReady
                            ? "Wallet access ready."
                            : "Verification pending.";
                    checklistThree = fundingGap > 0
                        ? "Send " + formatCurrency(selectedAmount) + "."
                        : "Target covered.";

                    setField("depositAssetTitle", cryptoAsset.name + " (" + cryptoAsset.symbol + ")");
                    setField("depositAssetGlyph", cryptoAsset.symbol);
                    setField("depositAssetTriggerName", cryptoAsset.name + " (" + cryptoAsset.symbol + ")");
                    setField("depositAssetTriggerMeta", cryptoAsset.network);
                    setField("depositAssetCopy", cryptoAsset.summary);
                    setField("depositAssetNetwork", cryptoAsset.network);
                    setField("depositAssetBadge", cryptoAsset.routeBadge || cryptoAsset.network);
                    setField("depositCryptoWalletAddress", cryptoAsset.address || "");
                    setField("depositCryptoRouteBadge", cryptoAsset.routeBadge || cryptoAsset.network);
                    setField("depositCryptoRouteNetwork", cryptoAsset.network);
                    setField("depositCryptoRouteCaption", cryptoAsset.routeCaption || ("Only send " + cryptoAsset.name + " assets to this address."));
                    syncSelectedCoinLogo(selectedCryptoAssetKey);
                    setField("depositCryptoRouteNote", cryptoAsset.routeNote || ("Scan the QR or copy the address exactly. Use only " + cryptoAsset.network + " for this route."));
                    if (depositCryptoQrImage) {
                        depositCryptoQrImage.setAttribute("src", getCryptoQrUrl(cryptoAsset.address || ""));
                        depositCryptoQrImage.setAttribute("alt", cryptoAsset.name + " deposit QR code");
                    }

                    if (!walletReady) {
                        nextTitle = "Connect wallet";
                        nextCopy = "Route ready. Connect wallet if required.";
                        primaryLabel = "Connect Wallet";
                        depositPrimaryTarget = "wallet-access";
                        secondaryLabel = "Verification";
                        depositSecondaryTarget = "verification";
                    } else if (!verificationReady) {
                        nextTitle = verificationStatus === "pending" ? "Verification pending" : "Complete verification";
                        nextCopy = verificationStatus === "pending"
                            ? "Route ready while review is pending."
                            : "Finish verification before payment.";
                        primaryLabel = verificationStatus === "pending" ? "Check Verification" : "Complete Verification";
                        depositPrimaryTarget = "verification";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    } else {
                        nextTitle = "Send " + cryptoAsset.symbol;
                        nextCopy = "Use the QR or address for " + formatCurrency(selectedAmount) + ".";
                        primaryLabel = "Wallet Access";
                        depositPrimaryTarget = "wallet-access";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    }
                } else if (selectedFundingMethod === "card") {
                    methodState = cardType.label;
                    accessState = verificationReady ? "Billing ready" : verification.label;
                    releaseWindow = "Secure checkout";
                    readinessTitle = "Billing";
                    readinessCopy = "Use the same billing identity on your account.";
                    checklistOne = cardType.summary;
                    checklistTwo = "Use the same billing name and email.";
                    checklistThree = "Keep the amount ready.";

                    setField("depositCardSupportTitle", cardType.label + " check");
                    setField("depositCardSupportCopy", "Use the same account name and email.");

                    if (!verificationReady) {
                        nextTitle = verificationStatus === "pending" ? "Verification pending" : "Verify billing";
                        nextCopy = verificationStatus === "pending"
                            ? "Checkout opens after review."
                            : "Complete verification before checkout.";
                        primaryLabel = verificationStatus === "pending" ? "Check Verification" : "Verify Billing";
                        depositPrimaryTarget = "verification";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    } else {
                        nextTitle = cardType.label + " ready";
                        nextCopy = "Continue with " + formatCurrency(selectedAmount) + ".";
                        primaryLabel = "Continue to Checkout";
                        depositPrimaryAction = "card-submit";
                        depositPrimaryTarget = "";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    }
                } else {
                    methodState = method.label;
                    accessState = verificationStatus === "unverified" ? "Review needed" : verification.label;
                    releaseWindow = "Manual review";
                    readinessTitle = "Review";
                    readinessCopy = "Enter the card details exactly as issued.";
                    checklistOne = "Enter issuer, holder, and reference.";
                    checklistTwo = verificationStatus === "pending"
                        ? "Verification in review."
                        : verificationStatus === "verified"
                            ? "Verification ready."
                            : "Verification required before approval.";
                    checklistThree = "Review window: " + method.window + ".";

                    setField("depositFanCardTitle", "Manual review");
                    setField("depositFanCardCopy", "The funding desk will review this card.");

                    if (verificationStatus === "unverified") {
                        nextTitle = "Complete verification";
                        nextCopy = "Verification is required before review.";
                        primaryLabel = "Complete Verification";
                        depositPrimaryTarget = "verification";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    } else {
                        nextTitle = "Submit for review";
                        nextCopy = "Send " + formatCurrency(selectedAmount) + " for desk review.";
                        primaryLabel = "Submit Fan Card";
                        depositPrimaryAction = "fan-submit";
                        depositPrimaryTarget = "";
                        secondaryLabel = "Support";
                        depositSecondaryTarget = "support";
                    }
                }

                setField("depositNextActionTitle", nextTitle);
                setField("depositNextActionCopy", nextCopy);
                setField("depositFundingMethodState", methodState);
                setField("depositFundingAccessState", accessState);
                setField("depositFundingWindow", releaseWindow);
                setField("depositChecklistOne", checklistOne);
                setField("depositChecklistTwo", checklistTwo);
                setField("depositChecklistThree", checklistThree);
                setField("depositReadinessTitle", readinessTitle);
                setField("depositReadinessCopy", readinessCopy);
                setField("planNextPrimaryLabel", primaryLabel);
                setField("planNextSecondaryLabel", secondaryLabel);
                renderPaymentProofStatus();
            };

            const handleDepositPrimaryAction = function () {
                const context = getPlanFundingContext();
                if (!context) return;

                if (depositPrimaryAction === "crypto-request") {
                    show("success", "Crypto Route Ready", context.cryptoAsset.name + " funding instructions are prepared for " + formatCurrency(context.selectedAmount) + ".", "Reference " + context.fundingReference + " will be used on the " + context.cryptoAsset.network + " lane.");
                    return;
                }

                if (depositPrimaryAction === "card-submit") {
                    const holder = depositCardHolderInput ? depositCardHolderInput.value.trim() : "";
                    const number = depositCardNumberInput ? digitsOnly(depositCardNumberInput.value) : "";
                    const expiry = depositCardExpiryInput ? depositCardExpiryInput.value.trim() : "";
                    const cvv = depositCardCvvInput ? digitsOnly(depositCardCvvInput.value) : "";
                    const country = depositCardCountryInput ? depositCardCountryInput.value.trim() : "";
                    const email = depositCardEmailInput ? depositCardEmailInput.value.trim() : "";
                    const expiryParts = expiry.split("/");
                    const expiryMonth = Number(expiryParts[0]);

                    if (!holder || number.length < 13 || number.length > 19 || expiryParts.length !== 2 || !Number.isFinite(expiryMonth) || expiryMonth < 1 || expiryMonth > 12 || digitsOnly(expiryParts[1]).length !== 2 || cvv.length < 3 || cvv.length > 4 || !country || !isLikelyEmail(email)) {
                        show("error", "Card Details Incomplete", "Complete the billing profile with a valid card number, expiry, CVV, country, and email.", "Use the same billing identity as your verified dashboard profile.");
                        return;
                    }

                    show("success", "Checkout Prepared", context.cardType.label + " funding request staged for " + formatCurrency(context.selectedAmount) + ".", "Billing profile " + maskCardNumber(number) + " in " + country + " is ready for secure issuer review.");
                    return;
                }

                if (depositPrimaryAction === "fan-submit") {
                    const provider = fanCardProviderInput ? fanCardProviderInput.value.trim() : "";
                    const holder = fanCardHolderInput ? fanCardHolderInput.value.trim() : "";
                    const reference = fanCardNumberInput ? fanCardNumberInput.value.trim() : "";
                    const pin = fanCardPinInput ? digitsOnly(fanCardPinInput.value) : "";
                    const email = fanCardEmailInput ? fanCardEmailInput.value.trim() : "";
                    const note = fanCardNoteInput ? fanCardNoteInput.value.trim() : "";

                    if (!provider || !holder || reference.length < 6 || pin.length < 4 || pin.length > 8 || !isLikelyEmail(email)) {
                        show("error", "Fan Card Details Incomplete", "Provide the issuer, holder name, card reference, valid security pin, and a reachable email address.", "Manual review depends on complete issuer details.");
                        return;
                    }

                    show("success", "Fan Card Submitted", provider + " funding request staged for " + formatCurrency(context.selectedAmount) + ".", "The funding desk will review the card reference and respond to " + email + (note ? " with your note on file." : "."));
                    return;
                }

                if (depositPrimaryTarget) {
                    setActiveView("#" + depositPrimaryTarget, { history: "push" });
                }
            };

            const handleDepositSecondaryAction = function () {
                if (!depositSecondaryTarget) return;
                setActiveView("#" + depositSecondaryTarget, { history: "push" });
            };

            const submitPaymentProof = async function () {
                const context = getPlanFundingContext();
                const latestSubmission = getLatestPaymentSubmission(currentPaymentSubmissions);

                if (!context || !pendingPaymentProof || isSubmittingPaymentProof) return;
                if (latestSubmission && latestSubmission.status === "pending") {
                    renderPaymentProofStatus();
                    return;
                }

                isSubmittingPaymentProof = true;
                renderPaymentProofStatus();

                try {
                    const response = await fetch(api + "/dashboard/payment-submissions", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            planKey: selectedPlanKey,
                            planName: context.plan.name,
                            fundingMethod: selectedFundingMethod,
                            amount: context.selectedAmount,
                            assetKey: selectedFundingMethod === "crypto" ? selectedCryptoAssetKey : null,
                            assetSymbol: selectedFundingMethod === "crypto" ? context.cryptoAsset.symbol : null,
                            assetName: selectedFundingMethod === "crypto" ? context.cryptoAsset.name : null,
                            network: selectedFundingMethod === "crypto" ? context.cryptoAsset.network : null,
                            routeAddress: selectedFundingMethod === "crypto" ? context.cryptoAsset.address || null : null,
                            proofImageDataUrl: pendingPaymentProof.dataUrl,
                            proofFileName: pendingPaymentProof.fileName,
                            proofMimeType: pendingPaymentProof.mimeType,
                            proofNote: selectedFundingMethod === "crypto" ? context.fundingReference : null
                        })
                    });

                    if (response.status === 401) {
                        await performLogout({ skipRemote: true, broadcast: true });
                        return;
                    }

                    const result = await parse(response);

                    if (!response.ok || !result.submitted || !result.submission) {
                        throw new Error(typeof result.message === "string" ? result.message : "Unable to submit this payment proof.");
                    }

                    resetPaymentProofDraft({ clearInput: true, render: false });
                    show(
                        "success",
                        "Proof Submitted",
                        "Your proof was sent for admin approval.",
                        result.submission.reference + " - " + formatCurrency(result.submission.amount) + " - " + formatStatusLabel(result.submission.status)
                    );
                    await load();
                } catch (error) {
                    show(
                        "error",
                        "Submission Failed",
                        error instanceof Error ? error.message : "Unable to submit this payment proof.",
                        "Upload a clear screenshot, then try again."
                    );
                } finally {
                    isSubmittingPaymentProof = false;
                    renderPaymentProofStatus();
                }
            };

            const setPlanCalculatorMode = function (value, options) {
                planCalculatorMode = value === "compound" ? "compound" : "simple";

                planCalculatorModeButtons.forEach(function (button) {
                    const isActive = button.getAttribute("data-plan-calc-mode") === planCalculatorMode;
                    button.classList.toggle("is-active", isActive);
                    button.setAttribute("aria-pressed", String(isActive));
                });

                if (!options || options.render !== false) {
                    renderPlanCalculator();
                }
            };

            const setPlanCalculatorAmount = function (value, options) {
                if (!planCalculatorAmountInput || !planCalculatorRangeInput) return;

                const plan = PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth;
                const amount = Math.round(clampNumber(value, 0, 250000, getSuggestedPlanAmount(plan)));
                planCalculatorAmountInput.value = String(amount);
                planCalculatorRangeInput.value = String(Math.round(clampNumber(amount, 500, 250000, 500)));
                syncPlanCalculatorPresetState(amount);

                if (!options || options.render !== false) {
                    renderPlanCalculator();
                }
            };

            const renderPlanCalculator = function () {
                if (!planCalculatorAmountInput || !planCalculatorCyclesSelect) return;

                const plan = PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth;
                const rawAmount = Number(planCalculatorAmountInput.value);
                const amount = Math.round(clampNumber(rawAmount, 0, 250000, getSuggestedPlanAmount(plan)));
                const cycles = Math.max(1, Math.min(12, Number(planCalculatorCyclesSelect.value) || 1));
                const rate = Number(plan.rate) || 0;
                const cycleDays = Math.max(1, Number(plan.cycleDays) || 30);
                const totalDays = cycleDays * cycles;
                const isCompound = planCalculatorMode === "compound";
                const projectedTotal = isCompound
                    ? amount * Math.pow(1 + rate, cycles)
                    : amount * (1 + (rate * cycles));
                const projectedProfit = projectedTotal - amount;
                const averageCycleGain = projectedProfit / cycles;
                const dailyEstimate = projectedProfit / totalDays;
                const shortfall = Math.max((Number(plan.minimum) || 0) - amount, 0);
                const qualifies = shortfall <= 0;
                const maturityDate = new Date();
                maturityDate.setDate(maturityDate.getDate() + totalDays);
                const eligiblePlanKey = getHighestEligiblePlanKey(amount);
                const eligiblePlan = eligiblePlanKey ? PLAN_LIBRARY[eligiblePlanKey] : null;
                const cycleLabel = cycles === 1 ? "1 cycle" : cycles + " cycles";
                const modeLabel = isCompound ? "compound" : "fixed return";
                const insightTitle = qualifies
                    ? plan.name.replace(" Plan", "") + " ready"
                    : eligiblePlan && eligiblePlanKey !== selectedPlanKey
                        ? eligiblePlan.name.replace(" Plan", "") + " fits now"
                        : "Below " + plan.name.replace(" Plan", "") + " minimum";
                const insightCopy = qualifies
                    ? "Meets entry level and projects " + formatCurrency(projectedProfit) + " profit."
                    : eligiblePlan && eligiblePlanKey !== selectedPlanKey
                        ? "Add " + formatCurrency(shortfall) + " for " + plan.name.replace(" Plan", "") + ", or proceed with " + eligiblePlan.name.replace(" Plan", "") + "."
                        : "Add " + formatCurrency(shortfall) + " to reach " + formatCurrency(plan.minimum) + ".";

                if (!Number.isFinite(rawAmount) || rawAmount < 0 || rawAmount > 250000) {
                    planCalculatorAmountInput.value = String(amount);
                }

                if (planCalculatorRangeInput) {
                    const rangeAmount = Math.round(clampNumber(amount, 500, 250000, 500));
                    if (Number(planCalculatorRangeInput.value) !== rangeAmount) {
                        planCalculatorRangeInput.value = String(rangeAmount);
                    }
                }

                setField("planCalcName", plan.name);
                setField("planCalcRate", formatNumber(rate * 100, 0, 0) + "% per cycle");
                setField("planCalcMinimum", qualifies
                    ? "Minimum cleared: " + formatCurrency(plan.minimum) + "."
                    : plan.name.replace(" Plan", "") + " minimum: " + formatCurrency(plan.minimum) + ". Add " + formatCurrency(shortfall) + "."
                );
                setField("planCalcProjectedTotal", formatCurrency(projectedTotal));
                setField("planCalcNarrative", plan.name + " / " + cycleLabel + " / " + totalDays + " days / " + modeLabel + ".");
                setField("planCalcProjectedProfit", formatCurrency(projectedProfit));
                setField("planCalcAverageCycleGain", formatCurrency(averageCycleGain));
                setField("planCalcDailyEstimate", formatCurrency(dailyEstimate));
                setField("planCalcMaturityDate", formatDateShort(maturityDate));
                setField("planCalcInsightTitle", insightTitle);
                setField("planCalcInsightCopy", insightCopy);
                setField("planCalcActionLabel", qualifies ? "Fund This Plan" : "Add Funds");

                document.querySelectorAll(".user-plan-calc-tier[data-plan-select]").forEach(function (button) {
                    const isActive = normalizePlanKey(button.getAttribute("data-plan-select")) === selectedPlanKey;
                    button.classList.toggle("is-active", isActive);
                    button.setAttribute("aria-pressed", String(isActive));
                });

                syncPlanCalculatorPresetState(amount);
            };

            const applySelectedPlan = function (value, options) {
                const key = normalizePlanKey(value);
                const plan = PLAN_LIBRARY[key];
                if (!plan) return;
                selectedPlanKey = key;

                if (!options || options.persist !== false) {
                    writeStoredPlanKey(key);
                }

                setField("selectedPlanName", plan.name);
                setField("selectedPlanSummary", plan.deck || plan.summary);
                setField("selectedPlanProfit", plan.profit);
                setField("selectedPlanCycle", plan.cycle);
                setField("selectedPlanMinimum", "Min " + formatCurrency(plan.minimum));

                document.querySelectorAll("[data-plan-card]").forEach(function (card) {
                    card.classList.toggle("is-selected", card.getAttribute("data-plan-card") === key);
                });

                planSelectButtons.forEach(function (button) {
                    button.classList.toggle("is-active", normalizePlanKey(button.getAttribute("data-plan-select")) === key);
                });

                if (planActivationAmountInput) {
                    planActivationAmountInput.value = String(getDefaultPlanFundingAmount(plan));
                }

                renderPlanCalculator();
                renderPlanFundingFlow();
            };

            const prefersReducedMotion = function () {
                return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
            };

            const resetPlanCardMotion = function (card) {
                if (!card) return;
                card.style.setProperty("--plan-rotate-x", "0deg");
                card.style.setProperty("--plan-rotate-y", "0deg");
                card.style.setProperty("--plan-glow-x", "50%");
                card.style.setProperty("--plan-glow-y", "18%");
            };

            const updatePlanCardMotion = function (card, event) {
                if (!card || prefersReducedMotion()) return;
                if (event.pointerType === "touch") return;

                const rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height) return;

                const relativeX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
                const relativeY = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
                const rotateY = (relativeX - 0.5) * 12;
                const rotateX = (0.5 - relativeY) * 10;

                card.style.setProperty("--plan-rotate-x", rotateX.toFixed(2) + "deg");
                card.style.setProperty("--plan-rotate-y", rotateY.toFixed(2) + "deg");
                card.style.setProperty("--plan-glow-x", (relativeX * 100).toFixed(2) + "%");
                card.style.setProperty("--plan-glow-y", (relativeY * 100).toFixed(2) + "%");
            };

            const formatNumber = function (value, minimumFractionDigits, maximumFractionDigits) {
                const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
                if (!Number.isFinite(numeric)) return "0.00";
                return new Intl.NumberFormat("en-US", {
                    minimumFractionDigits: minimumFractionDigits,
                    maximumFractionDigits: maximumFractionDigits
                }).format(numeric);
            };

            const formatPercentChange = function (value) {
                const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
                if (!Number.isFinite(numeric)) return "0.00%";
                return (numeric > 0 ? "+" : numeric < 0 ? "-" : "") + formatNumber(Math.abs(numeric), 2, 2) + "%";
            };

            const normalizeMarketSymbol = function (value) {
                const raw = typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
                if (!raw) return "";

                const preset = MARKET_PRESETS.find(function (candidate) {
                    return candidate.aliases.some(function (alias) {
                        return alias.toUpperCase().replace(/[^A-Z0-9]/g, "") === raw;
                    });
                });

                return preset ? preset.symbol : raw;
            };

            const getMarketPreset = function (value) {
                const normalized = normalizeMarketSymbol(value);
                return MARKET_PRESETS.find(function (candidate) { return candidate.symbol === normalized; }) || null;
            };

            const prettifyMarketSymbol = function (value) {
                const normalized = normalizeMarketSymbol(value);
                if (!normalized) return "Tracked Market";
                if (normalized.length === 6 && normalized.endsWith("USD")) {
                    return normalized.slice(0, 3) + "/" + normalized.slice(3);
                }
                if (normalized.length === 7 && normalized.endsWith("USDT")) {
                    return normalized.slice(0, normalized.length - 4) + "/USDT";
                }
                if (normalized.length === 6 && normalized.endsWith("JPY")) {
                    return normalized.slice(0, 3) + "/" + normalized.slice(3);
                }
                return normalized;
            };

            const cloneCandles = function (candles) {
                return Array.isArray(candles)
                    ? candles.map(function (candle) {
                        return {
                            direction: candle && candle.direction === "down" ? "down" : "up",
                            height: Number(candle && candle.height) || 4,
                            bottom: Number(candle && candle.bottom) || 1,
                            wickHeight: Number(candle && candle.wickHeight) || 6,
                            wickBottom: Number(candle && candle.wickBottom) || -2
                        };
                    })
                    : [];
            };

            const buildCandlesFromTrend = function (changePercent) {
                const template = [
                    { height: 2.5, bottom: 0.95, wickHeight: 5.7, wickBottom: -2.0 },
                    { height: 4.4, bottom: 1.35, wickHeight: 7.4, wickBottom: -1.95 },
                    { height: 6.8, bottom: 1.9, wickHeight: 9.8, wickBottom: -1.95 },
                    { height: 3.7, bottom: 1.3, wickHeight: 6.2, wickBottom: -1.85 },
                    { height: 5.9, bottom: 1.8, wickHeight: 8.7, wickBottom: -1.85 },
                    { height: 4.9, bottom: 1.5, wickHeight: 7.6, wickBottom: -1.8 },
                    { height: 7.1, bottom: 2.0, wickHeight: 10.2, wickBottom: -1.9 },
                    { height: 6.2, bottom: 1.75, wickHeight: 8.9, wickBottom: -1.85 }
                ];
                const amplitude = Math.min(Math.abs(Number(changePercent) || 0) * 0.22, 1.3);
                const bullishPattern = [false, true, true, true, false, true, true, true];
                const bearishPattern = [true, true, false, true, true, false, true, false];
                const pattern = (Number(changePercent) || 0) >= 0 ? bullishPattern : bearishPattern;

                return template.map(function (entry, index) {
                    const isUp = pattern[index];
                    return {
                        direction: isUp ? "up" : "down",
                        height: Math.max(2.1, entry.height + (isUp ? amplitude : amplitude * 0.2)),
                        bottom: Math.max(0.8, entry.bottom + (isUp ? amplitude * 0.12 : amplitude * 0.06)),
                        wickHeight: Math.max(4.6, entry.wickHeight + amplitude * 0.4),
                        wickBottom: entry.wickBottom
                    };
                });
            };

            const createInstrumentFromPreset = function (preset, overrides) {
                const next = Object.assign({}, preset, overrides || {});
                next.symbol = preset.symbol;
                next.aliases = Array.isArray(preset.aliases) ? preset.aliases.slice() : [preset.symbol];
                next.axis = Array.isArray(next.axis) && next.axis.length ? next.axis.slice(0, 6) : MARKET_DEFAULT_AXIS.slice();
                next.candles = cloneCandles(Array.isArray(next.candles) && next.candles.length ? next.candles : preset.candles);
                next.priority = Number(next.priority) || 0;
                next.tabLabel = next.tabLabel || prettifyMarketSymbol(next.symbol);
                next.headline = next.headline || next.tabLabel;
                next.selectLabel = next.selectLabel || (next.headline + " (" + next.tabLabel + ")");
                next.controlSymbol = next.controlSymbol || next.symbol;
                next.interval = next.interval || "30m";
                next.indicator = next.indicator || "Indicators";
                next.meta = next.meta || "Tracked from your dashboard activity";
                return next;
            };

            const createDerivedInstrument = function (symbol, assetName, source, priority) {
                const normalized = normalizeMarketSymbol(symbol);
                const preset = getMarketPreset(normalized);
                const referenceAmount = Number(source && source.amount != null ? source.amount : source && source.allocationUsd != null ? source.allocationUsd : 0);
                const pnlValue = Number(source && source.pnl);
                const changeFromPosition = referenceAmount > 0 && Number.isFinite(pnlValue)
                    ? (pnlValue / referenceAmount) * 100
                    : null;
                const statusLabel = source && source.status ? formatStatusLabel(source.status) : "Tracked";
                const activityDate = source && (source.openedAt || source.createdAt) ? formatDateShort(source.openedAt || source.createdAt) : "";
                const meta = activityDate
                    ? statusLabel + " - Synced " + activityDate
                    : "Synced from your dashboard activity";

                if (preset) {
                    const resolvedChange = Number.isFinite(changeFromPosition) ? changeFromPosition : Number(preset.changePercent) || 0;
                    return createInstrumentFromPreset(preset, {
                        meta: meta,
                        changePercent: resolvedChange,
                        candles: buildCandlesFromTrend(resolvedChange),
                        priority: priority
                    });
                }

                const resolvedPrice = Number.isFinite(referenceAmount) && referenceAmount > 0 ? referenceAmount : 0;
                const resolvedChange = Number.isFinite(changeFromPosition) ? changeFromPosition : 0;
                const tabLabel = prettifyMarketSymbol(normalized || symbol);
                const headline = assetName || tabLabel;

                return {
                    symbol: normalized || String(symbol || "MARKET").toUpperCase(),
                    aliases: [normalized || String(symbol || "MARKET").toUpperCase()],
                    tabLabel: tabLabel,
                    headline: headline,
                    selectLabel: headline + " (" + tabLabel + ")",
                    controlSymbol: normalized || tabLabel,
                    interval: "30m",
                    indicator: "Indicators",
                    meta: meta,
                    price: resolvedPrice,
                    priceDecimals: resolvedPrice >= 100 ? 2 : resolvedPrice >= 1 ? 4 : 6,
                    tabPricePrefix: resolvedPrice >= 5 ? "$" : "",
                    tabPriceDecimals: resolvedPrice >= 100 ? 0 : resolvedPrice >= 1 ? 4 : 6,
                    changePercent: resolvedChange,
                    axis: MARKET_DEFAULT_AXIS.slice(),
                    candles: buildCandlesFromTrend(resolvedChange),
                    priority: priority || 0
                };
            };

            const formatInstrumentPrice = function (instrument, mode) {
                if (!instrument) return "--";
                const numeric = Number(instrument.price);
                if (!Number.isFinite(numeric)) return "--";
                const decimals = mode === "tab"
                    ? Number.isFinite(Number(instrument.tabPriceDecimals)) ? Number(instrument.tabPriceDecimals) : Number(instrument.priceDecimals) || 2
                    : Number.isFinite(Number(instrument.priceDecimals)) ? Number(instrument.priceDecimals) : 2;
                const prefix = mode === "tab"
                    ? instrument.tabPricePrefix || ""
                    : instrument.pricePrefix || "";
                return prefix + formatNumber(numeric, decimals, decimals);
            };

            const buildMarketInstruments = function (dashboard) {
                const entries = [];
                const seen = new Set();
                const pushInstrument = function (instrument) {
                    if (!instrument || !instrument.symbol) return;
                    const normalized = normalizeMarketSymbol(instrument.symbol);
                    if (!normalized || seen.has(normalized)) return;
                    seen.add(normalized);
                    instrument.symbol = normalized;
                    entries.push(instrument);
                };

                const portfolioPositions = Array.isArray(dashboard && dashboard.portfolioPositions) ? dashboard.portfolioPositions : [];
                const tradeRecords = Array.isArray(dashboard && dashboard.tradeRecords) ? dashboard.tradeRecords : [];

                portfolioPositions.forEach(function (position, index) {
                    pushInstrument(createDerivedInstrument(position && position.assetSymbol, position && position.assetName, position, 260 - index));
                });

                tradeRecords.forEach(function (trade, index) {
                    pushInstrument(createDerivedInstrument(trade && trade.assetSymbol, trade && trade.assetName, trade, 220 - index));
                });

                ["BTCUSDT", "ETHUSDT", "EURUSD", "GBPUSD", "AAPL", "DE10Y", "XAUUSD"].forEach(function (symbol, index) {
                    const preset = getMarketPreset(symbol);
                    if (!preset) return;
                    pushInstrument(createInstrumentFromPreset(preset, { priority: 120 - index }));
                });

                return entries.sort(function (left, right) {
                    const priorityDelta = (Number(right.priority) || 0) - (Number(left.priority) || 0);
                    return priorityDelta !== 0 ? priorityDelta : String(left.symbol).localeCompare(String(right.symbol));
                });
            };

            const buildFundingSources = function (dashboard) {
                const liveBalance = Math.max(0, Number(dashboard && dashboard.accountBalance) || 0);
                const demoBalance = Math.max(0, Number(dashboard && dashboard.demoBalance) || 0);
                const sources = [
                    {
                        id: "live",
                        label: "USD",
                        description: "live balance",
                        available: liveBalance,
                        minimum: 50
                    }
                ];

                if (demoBalance > 0) {
                    sources.push({
                        id: "demo",
                        label: "Demo",
                        description: "demo balance",
                        available: demoBalance,
                        minimum: 50
                    });
                }

                return {
                    sources: sources,
                    preferredId: liveBalance >= 50 ? "live" : demoBalance > 0 ? "demo" : "live"
                };
            };

            const getSelectedMarketInstrument = function () {
                const fallbackSymbol = tradeAssetSelect && tradeAssetSelect.value ? tradeAssetSelect.value : selectedMarketSymbol;
                return marketInstruments.find(function (instrument) { return instrument.symbol === fallbackSymbol; }) || marketInstruments[0] || null;
            };

            const getSelectedFundingSource = function () {
                const selectedId = tradeFundingSourceSelect && tradeFundingSourceSelect.value ? tradeFundingSourceSelect.value : "";
                return fundingSources.find(function (source) { return source.id === selectedId; }) || fundingSources[0] || null;
            };

            const renderCandles = function (candles) {
                if (!marketCandleContainer) return;
                marketCandleContainer.replaceChildren();

                cloneCandles(candles).forEach(function (candle) {
                    const node = document.createElement("span");
                    node.className = "user-candle " + (candle.direction === "down" ? "is-red" : "is-green");
                    node.style.setProperty("--candle-height", Math.max(1.8, Number(candle.height) || 4) + "rem");
                    node.style.setProperty("--candle-bottom", Math.max(0.7, Number(candle.bottom) || 1) + "rem");
                    node.style.setProperty("--wick-height", Math.max(3.8, Number(candle.wickHeight) || 6) + "rem");
                    node.style.setProperty("--wick-bottom", (Number.isFinite(Number(candle.wickBottom)) ? Number(candle.wickBottom) : -2) + "rem");
                    marketCandleContainer.appendChild(node);
                });
            };

            const renderMarketAxis = function (labels) {
                if (!marketAxis) return;
                marketAxis.replaceChildren();

                (Array.isArray(labels) && labels.length ? labels.slice(0, 6) : MARKET_DEFAULT_AXIS).forEach(function (label) {
                    const node = document.createElement("span");
                    node.textContent = label;
                    marketAxis.appendChild(node);
                });
            };

            const renderMarketOverview = function () {
                if (!marketTabs) return;
                const selectedInstrument = getSelectedMarketInstrument();
                if (!selectedInstrument) {
                    marketTabs.replaceChildren();
                    renderCandles([]);
                    renderMarketAxis(MARKET_DEFAULT_AXIS);
                    return;
                }

                selectedMarketSymbol = selectedInstrument.symbol;

                const orderedTabs = [selectedInstrument].concat(
                    marketInstruments.filter(function (instrument) { return instrument.symbol !== selectedInstrument.symbol; })
                ).slice(0, 5);

                marketTabs.replaceChildren();
                orderedTabs.forEach(function (instrument) {
                    const button = document.createElement("button");
                    const label = document.createElement("span");
                    const price = document.createElement("span");
                    const dot = document.createElement("span");

                    button.type = "button";
                    button.className = "user-market-tab" + (instrument.symbol === selectedInstrument.symbol ? " is-active" : "");
                    button.setAttribute("aria-pressed", String(instrument.symbol === selectedInstrument.symbol));
                    dot.className = "dot";
                    label.textContent = instrument.tabLabel;
                    price.className = "user-market-tab-price";
                    price.textContent = formatInstrumentPrice(instrument, "tab");

                    button.appendChild(dot);
                    button.appendChild(label);
                    if (price.textContent !== "--") {
                        button.appendChild(price);
                    }

                    button.addEventListener("click", function () {
                        selectedMarketSymbol = instrument.symbol;
                        if (tradeAssetSelect) {
                            tradeAssetSelect.value = instrument.symbol;
                        }
                        renderMarketOverview();
                    });

                    marketTabs.appendChild(button);
                });

                setField("marketControlSymbol", selectedInstrument.controlSymbol || selectedInstrument.symbol);
                setField("marketControlInterval", selectedInstrument.interval || "30m");
                setField("marketControlIndicator", selectedInstrument.indicator || "Indicators");
                setField("marketHeadline", selectedInstrument.headline || selectedInstrument.tabLabel);
                setField("marketMeta", selectedInstrument.meta || "Tracked from your dashboard activity");
                setField("marketPrice", formatInstrumentPrice(selectedInstrument, "display"));
                marketChangeNodes.forEach(function (node) {
                    node.textContent = formatPercentChange(selectedInstrument.changePercent);
                    node.classList.toggle("is-negative", Number(selectedInstrument.changePercent) < 0);
                    node.classList.toggle("is-positive", Number(selectedInstrument.changePercent) >= 0);
                });
                renderCandles(Array.isArray(selectedInstrument.candles) && selectedInstrument.candles.length
                    ? selectedInstrument.candles
                    : buildCandlesFromTrend(selectedInstrument.changePercent));
                renderMarketAxis(selectedInstrument.axis);
            };

            const syncQuickTradeCopy = function (source) {
                const walletConnected = Boolean(currentDashboard && currentDashboard.walletConnected);
                if (source && source.id === "live" && source.available > 0) {
                    setField("quickTradeHeroCopy", "Use your funded live balance to stage entries directly from your Novabit dashboard.");
                    setField("quickTradeLead", "Choose an instrument, position size, leverage, and holding window using your live capital.");
                    return;
                }

                if (source && source.id === "demo" && source.available > 0) {
                    setField("quickTradeHeroCopy", "Your demo balance is ready. Practice with the same watchlist shown in your market overview.");
                    setField("quickTradeLead", "Rehearse trade sizing and timing here before you move capital into a funded live account.");
                    return;
                }

                if (walletConnected) {
                    setField("quickTradeHeroCopy", "Your account is connected. Add live funds to activate direct order routing from this ticket.");
                    setField("quickTradeLead", "Live balances take priority here once the account is funded and trade execution is enabled.");
                    return;
                }

                setField("quickTradeHeroCopy", "Connect your funding path or use demo capital before opening a live position from this workspace.");
                setField("quickTradeLead", "A funded balance unlocks full live routing. Until then, you can validate trade parameters against your demo account.");
            };

            const syncFundingPresentation = function () {
                const source = getSelectedFundingSource();
                syncQuickTradeCopy(source);

                if (!tradeAmountInput) return;

                if (!source) {
                    setField("tradeFundingNote", "No funding source is available yet.");
                    tradeAmountInput.placeholder = "Invest Amount (0.00)";
                    return;
                }

                const previewAnchor = source.available > 0 ? Math.min(source.available, source.id === "demo" ? 1000 : 5000) : 0;
                tradeAmountInput.placeholder = "Invest Amount (" + formatNumber(previewAnchor, 2, 2) + ")";

                if (source.available > 0) {
                    setField("tradeFundingNote", "Available: " + formatCurrency(source.available) + " " + source.description + ". Min: " + formatCurrency(source.minimum) + ".");
                    return;
                }

                setField("tradeFundingNote", "Available: " + formatCurrency(0) + " " + source.description + ". Deposit funds or switch to demo.");
            };

            const renderQuickTrade = function () {
                if (!tradeAssetSelect || !tradeFundingSourceSelect) return;
                const optionInstruments = marketInstruments.slice(0, 7);

                tradeAssetSelect.replaceChildren();
                optionInstruments.forEach(function (instrument) {
                    const option = document.createElement("option");
                    option.value = instrument.symbol;
                    option.textContent = instrument.selectLabel || instrument.tabLabel;
                    tradeAssetSelect.appendChild(option);
                });

                if (optionInstruments.length) {
                    const preferredSymbol = selectedMarketSymbol && optionInstruments.some(function (instrument) { return instrument.symbol === selectedMarketSymbol; })
                        ? selectedMarketSymbol
                        : optionInstruments[0].symbol;
                    tradeAssetSelect.value = preferredSymbol;
                    selectedMarketSymbol = preferredSymbol;
                }

                tradeFundingSourceSelect.replaceChildren();
                fundingSources.forEach(function (source) {
                    const option = document.createElement("option");
                    option.value = source.id;
                    option.textContent = source.label;
                    tradeFundingSourceSelect.appendChild(option);
                });

                if (fundingSources.length) {
                    const preferredFunding = fundingSources.some(function (source) { return source.id === tradeFundingSourceSelect.value; })
                        ? tradeFundingSourceSelect.value
                        : buildFundingSources(currentDashboard).preferredId;
                    tradeFundingSourceSelect.value = preferredFunding;
                }

                syncFundingPresentation();
                renderMarketOverview();
            };

            const parseTradeAmount = function (value) {
                const normalized = String(value == null ? "" : value).replace(/,/g, "").replace(/[^0-9.]/g, "");
                const amount = Number(normalized);
                return Number.isFinite(amount) ? amount : NaN;
            };

            const handleTradePreview = function (side) {
                const instrument = getSelectedMarketInstrument();
                const source = getSelectedFundingSource();
                const amount = parseTradeAmount(tradeAmountInput ? tradeAmountInput.value : "");
                const leverage = tradeLeverageSelect ? tradeLeverageSelect.value : "";
                const expiration = tradeExpirationSelect ? tradeExpirationSelect.value : "";

                if (!instrument) {
                    show("error", "Trade Ticket Incomplete", "Choose an instrument before you continue.", "Your dashboard market list is still syncing.");
                    return;
                }

                if (!source) {
                    show("error", "Funding Source Required", "Choose a funding source before you continue.", "Live and demo balances are loaded from your dashboard account.");
                    return;
                }

                if (!Number.isFinite(amount) || amount <= 0) {
                    show("error", "Invalid Amount", "Enter a valid trade amount to continue.", "Use a numeric value that fits inside your selected funding balance.");
                    return;
                }

                if (amount < source.minimum) {
                    show("error", "Amount Below Minimum", "The trade amount must be at least " + formatCurrency(source.minimum) + ".", "Increase the amount or switch to a different funding source.");
                    return;
                }

                if (source.available <= 0) {
                    show("error", "No Available Balance", "Your selected " + source.description + " is empty.", source.id === "live" ? "Open the deposit panel or switch to demo trading." : "Refresh the account or fund the workspace before trying again.");
                    return;
                }

                if (amount > source.available) {
                    show("error", "Insufficient Balance", "This ticket exceeds the available " + source.description + ".", "Available right now: " + formatCurrency(source.available) + ".");
                    return;
                }

                if (!leverage || !expiration) {
                    show("error", "Complete The Ticket", "Select both leverage and expiration before continuing.", "The trade workspace needs those values to stage the preview correctly.");
                    return;
                }

                show(
                    "success",
                    side === "buy" ? "Buy Preview Ready" : "Sell Preview Ready",
                    (side === "buy" ? "Buy " : "Sell ") + instrument.tabLabel + " for " + formatCurrency(amount) + " from your " + source.description + " at " + leverage + " leverage with a " + expiration + " expiration.",
                    source.id === "demo"
                        ? "Demo parameters are valid. Move to live funding when you are ready to execute against a real balance."
                        : "This live ticket now reflects your real account balance and can plug into server-side execution when those mutations are enabled."
                );
            };

            const renderOverviewActivity = function (statementEntries, paymentEntries) {
                if (!overviewActivityList) return;

                const items = [];

                if (Array.isArray(statementEntries) && statementEntries.length) {
                    statementEntries
                        .slice()
                        .sort(function (left, right) { return new Date(right && right.createdAt ? right.createdAt : 0).getTime() - new Date(left && left.createdAt ? left.createdAt : 0).getTime(); })
                        .slice(0, 5)
                        .forEach(function (entry) {
                            const amountValue = Number(entry && entry.amount);
                            const tone = Number.isFinite(amountValue) && amountValue > 0
                                ? "is-positive"
                                : Number.isFinite(amountValue) && amountValue < 0
                                    ? "is-negative"
                                    : "";

                            items.push({
                                tone: tone,
                                marker: tone === "is-positive" ? "+" : tone === "is-negative" ? "-" : "•",
                                title: entry && entry.title ? entry.title : "Account activity",
                                meta: formatDateTime(entry && entry.createdAt) + (entry && entry.description ? " - " + entry.description : ""),
                                amount: Number.isFinite(amountValue) ? (amountValue > 0 ? "+" : amountValue < 0 ? "-" : "") + formatCurrency(Math.abs(amountValue)) : "--"
                            });
                        });
                }

                if (!items.length && Array.isArray(paymentEntries) && paymentEntries.length) {
                    sortPaymentSubmissions(paymentEntries).slice(0, 5).forEach(function (entry) {
                        const status = formatStatusLabel(entry && entry.status);
                        items.push({
                            tone: entry && entry.status === "approved" ? "is-positive" : entry && entry.status === "rejected" ? "is-negative" : "",
                            marker: entry && entry.status === "approved" ? "+" : entry && entry.status === "rejected" ? "-" : "•",
                            title: (entry && entry.reference ? entry.reference : "Deposit") + " / " + status,
                            meta: getDepositHistoryLane(entry) + " - " + formatDateTime(entry && entry.createdAt),
                            amount: formatCurrency(entry && entry.amount)
                        });
                    });
                }

                if (!items.length) {
                    overviewActivityList.innerHTML = '<div class="user-overview-empty"><strong>No recent activity</strong><p>Deposits, credits, and account movement will appear here.</p></div>';
                    return;
                }

                overviewActivityList.innerHTML = items.map(function (item) {
                    return '<div class="user-overview-activity-item">' +
                        '<span class="user-overview-activity-icon ' + escapeHtml(item.tone) + '">' + escapeHtml(item.marker) + '</span>' +
                        '<div class="user-overview-activity-copy"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.meta) + '</span></div>' +
                        '<span class="user-overview-activity-amount ' + escapeHtml(item.tone) + '">' + escapeHtml(item.amount) + '</span>' +
                        '</div>';
                }).join("");
            };

            const renderOverviewStrategyTable = function (portfolioEntries, tradeEntries) {
                if (!overviewStrategyList) return;

                const baseBalance = Math.max(
                    Number(currentDashboard && currentDashboard.accountBalance) || 0,
                    Number(currentDashboard && currentDashboard.totalDeposit) || 0,
                    1
                );

                let rows = [];

                if (Array.isArray(portfolioEntries) && portfolioEntries.length) {
                    rows = portfolioEntries
                        .slice()
                        .sort(function (left, right) { return new Date(right && right.openedAt ? right.openedAt : 0).getTime() - new Date(left && left.openedAt ? left.openedAt : 0).getTime(); })
                        .slice(0, 6)
                        .map(function (entry, index) {
                            const allocation = Number(entry && entry.allocationUsd) || 0;
                            const pnl = Number(entry && entry.pnl) || 0;
                            return {
                                title: (entry && entry.assetSymbol ? entry.assetSymbol : "ASSET") + " / " + formatStatusLabel(entry && entry.status),
                                meta: entry && entry.assetName ? entry.assetName : "Tracked position",
                                allocationLabel: formatCurrency(allocation),
                                progress: clampNumber((allocation / baseBalance) * 100, 8, 96, 24 + index * 12),
                                startedPrimary: formatDateCompact(entry && entry.openedAt),
                                startedMeta: "Live position",
                                pnlLabel: (pnl > 0 ? "+" : pnl < 0 ? "-" : "") + formatCurrency(Math.abs(pnl)),
                                pnlMeta: pnl >= 0 ? "Open profit" : "Open drawdown",
                                pnlTone: pnl >= 0 ? "is-positive" : "is-negative",
                                primaryTarget: "portfolio",
                                primaryLabel: "Open",
                                secondaryTarget: "performance",
                                secondaryLabel: "Detail"
                            };
                        });
                } else if (Array.isArray(tradeEntries) && tradeEntries.length) {
                    rows = tradeEntries
                        .slice()
                        .sort(function (left, right) { return new Date(right && right.openedAt ? right.openedAt : 0).getTime() - new Date(left && left.openedAt ? left.openedAt : 0).getTime(); })
                        .slice(0, 6)
                        .map(function (entry, index) {
                            const allocation = Number(entry && entry.amount) || 0;
                            const pnl = Number(entry && entry.pnl);
                            return {
                                title: (entry && entry.assetSymbol ? entry.assetSymbol : "ASSET") + " / " + formatStatusLabel(entry && entry.side),
                                meta: entry && entry.assetName ? entry.assetName : "Market ticket",
                                allocationLabel: formatCurrency(allocation),
                                progress: clampNumber((allocation / baseBalance) * 100, 8, 96, 22 + index * 12),
                                startedPrimary: formatDateCompact(entry && entry.openedAt),
                                startedMeta: formatStatusLabel(entry && entry.status),
                                pnlLabel: Number.isFinite(pnl) ? (pnl > 0 ? "+" : pnl < 0 ? "-" : "") + formatCurrency(Math.abs(pnl)) : formatStatusLabel(entry && entry.status),
                                pnlMeta: Number.isFinite(pnl) ? "Trade result" : "Trade status",
                                pnlTone: Number.isFinite(pnl) ? (pnl >= 0 ? "is-positive" : "is-negative") : "",
                                primaryTarget: "performance",
                                primaryLabel: "Open",
                                secondaryTarget: "statement",
                                secondaryLabel: "Detail"
                            };
                        });
                } else {
                    rows = Object.keys(PLAN_LIBRARY).map(function (key, index) {
                        const plan = PLAN_LIBRARY[key];
                        return {
                            title: plan.name,
                            meta: plan.deck,
                            allocationLabel: formatCurrency(plan.minimum),
                            progress: 34 + index * 19,
                            startedPrimary: plan.cycle,
                            startedMeta: "Available now",
                            pnlLabel: plan.profit,
                            pnlMeta: "Target return",
                            pnlTone: "is-positive",
                            primaryTarget: "plans",
                            primaryLabel: "Open",
                            secondaryTarget: "deposit-funds",
                            secondaryLabel: "Fund"
                        };
                    });
                }

                overviewStrategyList.innerHTML = '<div class="user-overview-strategy-row user-overview-strategy-row--head"><span>Track</span><span>Allocation</span><span>Started</span><span>P/L</span><span>Actions</span></div>' + rows.map(function (row) {
                    return '<div class="user-overview-strategy-row">' +
                        '<div class="user-overview-strategy-main"><strong>' + escapeHtml(row.title) + '</strong><span>' + escapeHtml(row.meta) + '</span></div>' +
                        '<div class="user-overview-progress"><div class="user-overview-progress-bar"><i style="width:' + escapeHtml(String(clampNumber(row.progress, 0, 100, 0))) + '%"></i></div><span>' + escapeHtml(row.allocationLabel) + " / " + escapeHtml(formatNumber(row.progress, 0, 0)) + '%</span></div>' +
                        '<div class="user-overview-strategy-cell"><strong>' + escapeHtml(row.startedPrimary) + '</strong><span>' + escapeHtml(row.startedMeta) + '</span></div>' +
                        '<div class="user-overview-strategy-cell user-overview-pnl ' + escapeHtml(row.pnlTone) + '"><strong>' + escapeHtml(row.pnlLabel) + '</strong><span>' + escapeHtml(row.pnlMeta) + '</span></div>' +
                        '<div class="user-overview-row-actions"><button type="button" class="user-overview-row-button primary" data-overview-open="' + escapeHtml(row.primaryTarget) + '">' + escapeHtml(row.primaryLabel) + '</button><button type="button" class="user-overview-row-button" data-overview-open="' + escapeHtml(row.secondaryTarget) + '">' + escapeHtml(row.secondaryLabel) + '</button></div>' +
                        '</div>';
                }).join("");
            };

            const renderStatementEntries = function (entries) {
                if (!statementList) return;

                const items = Array.isArray(entries)
                    ? entries.slice().sort(function (left, right) { return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(); }).slice(0, 8)
                    : [];

                if (!items.length) {
                    statementList.innerHTML = '<div class="user-empty-state"><strong>No account activity recorded yet</strong><p>Your account history will populate here as your profile evolves.</p></div>';
                    return;
                }

                statementList.innerHTML = '<div class="user-table-row user-table-row--head"><span>Activity</span><span>Amount</span><span>Status</span></div>' + items.map(function (entry) {
                    const amount = entry && entry.amount != null ? formatCurrency(entry.amount) : "--";
                    const description = entry && entry.description ? entry.description : "Recorded in the Novabit account ledger.";

                    return '<div class="user-table-row"><div><strong>' + escapeHtml(entry && entry.title ? entry.title : "Account update") + '</strong><p>' + escapeHtml(formatDateTime(entry && entry.createdAt)) + " - " + escapeHtml(description) + '</p></div><span>' + escapeHtml(amount) + '</span><span class="user-tag">' + escapeHtml(formatStatusLabel(entry && entry.status)) + "</span></div>";
                }).join("");
            };

            const renderTradeRecords = function (entries) {
                if (!tradeList) return;

                const items = Array.isArray(entries)
                    ? entries.slice().sort(function (left, right) { return new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime(); }).slice(0, 6)
                    : [];

                if (!items.length) {
                    tradeList.innerHTML = '<div class="user-table-row user-table-row--head"><span>Details</span><span>Amount</span><span>Status</span></div><div class="user-empty-state"><strong>No trades have been placed yet</strong><p>Demo and live trade activity will populate here after your first position opens.</p></div>';
                    return;
                }

                tradeList.innerHTML = '<div class="user-table-row user-table-row--head"><span>Details</span><span>Amount</span><span>Status</span></div>' + items.map(function (entry) {
                    const assetSymbol = entry && entry.assetSymbol ? entry.assetSymbol : "ASSET";
                    const assetName = entry && entry.assetName ? entry.assetName : "Tracked instrument";
                    const side = formatStatusLabel(entry && entry.side);

                    return '<div class="user-table-row"><div><strong>' + escapeHtml(assetSymbol + " - " + side) + '</strong><p>' + escapeHtml(assetName) + " - Opened " + escapeHtml(formatDateTime(entry && entry.openedAt)) + '</p></div><span>' + escapeHtml(formatCurrency(entry && entry.amount)) + '</span><span class="user-tag">' + escapeHtml(formatStatusLabel(entry && entry.status)) + "</span></div>";
                }).join("");
            };

            const renderPortfolioPositions = function (entries) {
                if (!portfolioList) return;

                const items = Array.isArray(entries)
                    ? entries.slice().sort(function (left, right) { return new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime(); }).slice(0, 6)
                    : [];

                if (!items.length) {
                    portfolioList.innerHTML = '<div class="user-empty">Portfolio activity appears here after your first funded position.</div>';
                    return;
                }

                portfolioList.innerHTML = items.map(function (entry) {
                    const pnlValue = Number(entry && entry.pnl);
                    const pnlLabel = Number.isFinite(pnlValue) ? (pnlValue > 0 ? "+" : "") + formatCurrency(pnlValue) : "$0.00";

                    return '<div class="user-action"><div><strong>' + escapeHtml((entry && entry.assetSymbol ? entry.assetSymbol : "ASSET") + " - " + formatStatusLabel(entry && entry.status)) + '</strong><span>' + escapeHtml(entry && entry.assetName ? entry.assetName : "Tracked position") + " - Opened " + escapeHtml(formatDateShort(entry && entry.openedAt)) + '</span></div><span>' + escapeHtml(formatCurrency(entry && entry.allocationUsd)) + " / " + escapeHtml(pnlLabel) + "</span></div>";
                }).join("");
            };

            const hideFeedback = function () {
                feedback.className = "hidden";
                feedback.innerHTML = "";
            };

            const setProfileMenuOpen = function (isOpen) {
                if (!profileMenu || !profileMenuTrigger) return;
                profileMenu.hidden = !isOpen;
                profileMenuTrigger.setAttribute("aria-expanded", String(Boolean(isOpen)));
                profileMenuTrigger.classList.toggle("is-open", Boolean(isOpen));
            };

            const closeProfileMenu = function () {
                setProfileMenuOpen(false);
            };

            const setActiveView = function (value, options) {
                const nextView = normalizeView(value);
                const historyMode = options && options.history === "replace" ? "replace" : "push";
                closeProfileMenu();
                closeDepositDetailModal();
                closeFundingMethodPopup();
                closeCryptoSelector();
                panels.forEach(function (panel) {
                    panel.hidden = panel.getAttribute("data-dashboard-panel") !== nextView;
                });
                navLinks.forEach(function (link) {
                    link.classList.toggle("is-active", normalizeView(link.getAttribute("href")) === nextView);
                });
                writeStoredView(nextView);

                if (!options || options.updateHash !== false) {
                    const nextHash = "#" + nextView;
                    if (window.location.hash !== nextHash) {
                        if (window.history && historyMode === "push" && typeof window.history.pushState === "function") {
                            window.history.pushState({ dashboardView: nextView }, "", nextHash);
                        } else if (window.history && typeof window.history.replaceState === "function") {
                            window.history.replaceState({ dashboardView: nextView }, "", nextHash);
                        } else {
                            window.location.hash = nextHash;
                        }
                    } else if (window.history && historyMode === "replace" && typeof window.history.replaceState === "function") {
                        window.history.replaceState({ dashboardView: nextView }, "", nextHash);
                    }
                }

                if (!options || options.scroll !== false) {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
            };

            const show = function (type, title, message, detail) {
                feedback.className = "user-feedback " + (type === "success" ? "is-success" : "is-error");
                feedback.innerHTML = '<p class="user-feedback-title">' + title + '</p>' + '<p class="user-feedback-copy">' + message + '</p>' + (detail ? '<p class="user-feedback-copy">' + detail + '</p>' : "");
                feedback.classList.remove("hidden");
            };

            const parse = async function (response) {
                const text = await response.text();
                return text ? JSON.parse(text) : {};
            };

            const refreshSession = async function () {
                if (logoutInProgress) return false;

                try {
                    const response = await fetch(api + "/auth/session/refresh", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json"
                        },
                        body: "{}"
                    });

                    if (response.status === 401) {
                        await performLogout({ skipRemote: true, broadcast: true });
                        return false;
                    }

                    if (!response.ok) {
                        return false;
                    }

                    lastSessionRefreshAt = Date.now();
                    return true;
                } catch {
                    return false;
                }
            };

            const trackActivity = function (options) {
                if (logoutInProgress) return;

                const now = Date.now();
                const force = Boolean(options && options.force);
                const shouldRefresh = !options || options.refresh !== false;

                lastActivityAt = now;

                if (force || now - lastActivityPersistedAt >= ACTIVITY_STORAGE_SYNC_MS) {
                    lastActivityPersistedAt = now;
                    writeStoredTimestamp(ACTIVITY_STORAGE_KEY, now);
                }

                if (shouldRefresh && !document.hidden && (force || now - lastSessionRefreshAt >= SESSION_REFRESH_THROTTLE_MS)) {
                    void refreshSession();
                }
            };

            const load = async function () {
                try {
                    const response = await fetch(api + "/dashboard", { credentials: "include", headers: { Accept: "application/json" } });
                    if (response.status === 401) {
                        await performLogout({ skipRemote: true, broadcast: true });
                        return;
                    }

                    const result = await parse(response);

                    if (!response.ok || !result.authenticated || !result.user || !result.dashboard) {
                        throw new Error(typeof result.message === "string" ? result.message : "Unable to load your dashboard.");
                    }

                    const user = result.user;
                    const dashboard = result.dashboard;
                    const paymentSubmissions = sortPaymentSubmissions(result.paymentSubmissions);
                    const statementEntries = Array.isArray(dashboard.statementEntries) ? dashboard.statementEntries : [];
                    const tradeRecords = Array.isArray(dashboard.tradeRecords) ? dashboard.tradeRecords : [];
                    const portfolioPositions = Array.isArray(dashboard.portfolioPositions) ? dashboard.portfolioPositions : [];
                    const joined = user.createdAt ? new Date(user.createdAt) : null;
                    const username = user.username || "Unavailable";
                    const referralCode = dashboard.referralCode || (username !== "Unavailable" ? "NOVA-" + username.toUpperCase() : "NOVA-USER");
                    const verification = describeVerification(dashboard.verificationStatus);
                    const wallet = describeWallet(Boolean(dashboard.walletConnected));
                    const couponStatus = user.couponAccepted && user.coupon
                        ? "Coupon linked"
                        : user.coupon
                            ? "Coupon submitted"
                            : dashboard.bonusBalance > 0
                                ? "Active bonus"
                                : "No coupon";
                    const accountBalance = formatCurrency(dashboard.accountBalance);
                    const updatedAt = formatDateTime(dashboard.updatedAt);
                    const updatedAtShort = formatDateShort(dashboard.updatedAt);
                    const createdAtLong = joined ? joined.toLocaleString() : "Unavailable";
                    const createdAtShort = joined ? joined.toLocaleDateString() : "Unavailable";
                    const pendingCount = Math.max(
                        Number(dashboard.pendingItems) || 0,
                        statementEntries.filter(function (entry) { return entry && entry.status === "pending"; }).length
                    );
                    const hasFinancialActivity = Number(dashboard.totalDeposit) > 0 || Number(dashboard.totalWithdrawal) > 0 || Number(dashboard.totalProfit) !== 0 || tradeRecords.length > 0;
                    const performanceSummary = hasFinancialActivity
                        ? "Your account ledger is live. Deposits, withdrawals, bonuses, and trades are being stored against this user profile."
                        : "Your account database is live, but no funding or trading activity has been recorded yet.";
                    const referralBase = window.location.protocol === "file:" ? "https://novabit.com" : window.location.origin;
                    const fundingState = buildFundingSources(dashboard);
                    const overviewSnapshotDate = toDate(dashboard.updatedAt) || new Date();
                    const overviewDateLabel = overviewSnapshotDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
                    const initialBalanceSource = Number(dashboard.totalDeposit) > 0
                        ? Number(dashboard.totalDeposit)
                        : Number(dashboard.accountBalance) - Number(dashboard.totalProfit);
                    const overviewInitialBalanceValue = Number.isFinite(initialBalanceSource) ? Math.max(initialBalanceSource, 0) : 0;
                    const overviewProfitRate = overviewInitialBalanceValue > 0
                        ? (Number(dashboard.totalProfit) / overviewInitialBalanceValue) * 100
                        : 0;

                    currentUserProfile = user;
                    currentDashboard = dashboard;
                    currentPaymentSubmissions = paymentSubmissions;
                    marketInstruments = buildMarketInstruments(dashboard);
                    fundingSources = fundingState.sources;
                    if (!marketInstruments.some(function (instrument) { return instrument.symbol === selectedMarketSymbol; })) {
                        selectedMarketSymbol = marketInstruments.length ? marketInstruments[0].symbol : "";
                    }

                    setField("name", user.name || "Investor");
                    setField("username", username);
                    setField("email", user.email || "Unavailable");
                    setField("phone", user.phone || "Not added");
                    setField("country", user.country || "Unavailable");
                    setField("accountRole", dashboard.accountRole || "Trading Account");
                    setField("accountBalance", accountBalance);
                    setField("couponStatus", couponStatus);
                    setField("sessionMode", formatModeLabel(result.sessionMode));
                    setField("createdAt", createdAtLong);
                    setField("createdAtShort", createdAtShort);
                    setField("updatedAt", updatedAt);
                    setField("updatedAtShort", updatedAtShort);
                    setField("accessRole", dashboard.accountRole || "Trading Account");
                    setField("accountState", dashboard.accountState || "Session active");
                    setField("referralCode", referralCode);
                    setField("referralRate", String(Number(dashboard.referralRatePercent) || 0) + "%");
                    setField("referralUrl", referralBase + "/ref/" + encodeURIComponent(referralCode.toLowerCase()));
                    setField("demoBalance", formatCurrency(dashboard.demoBalance));
                    setField("totalProfit", formatCurrency(dashboard.totalProfit));
                    setField("totalDeposit", formatCurrency(dashboard.totalDeposit));
                    setField("totalWithdrawal", formatCurrency(dashboard.totalWithdrawal));
                    setField("bonusBalance", formatCurrency(dashboard.bonusBalance));
                    setField("verificationBadge", verification.label);
                    setField("verificationStatus", verification.label);
                    setField("verificationSummary", verification.summary);
                    setField("verificationStateMessage", verification.detail);
                    setField("walletStatus", wallet.status);
                    setField("walletBannerTitle", wallet.title);
                    setField("walletBannerCopy", wallet.copy);
                    setField("walletActionShort", wallet.shortAction);
                    setField("walletActionLong", wallet.longAction);
                    setField("activePlans", String(Number(dashboard.activePlans) || 0));
                    setField("pendingItems", String(Number(dashboard.pendingItems) || 0));
                    setField("portfolioBalance", accountBalance);
                    setField("performanceSummary", performanceSummary);
                    setField("overviewDateLabel", "Account overview - " + overviewDateLabel);
                    setField("overviewDateRange", formatDateCompact(overviewSnapshotDate) + " snapshot");
                    setField("overviewInitialBalance", formatCurrency(overviewInitialBalanceValue));
                    setField("overviewProfitRate", formatPercentChange(overviewProfitRate));
                    setField("overviewStartedAt", createdAtShort);
                    setField("overviewProfitToDate", formatCurrency(dashboard.totalProfit));
                    setProfileInitials(user.name || username || "Novabit");
                    if (tradeFundingSourceSelect && fundingSources.some(function (source) { return source.id === fundingState.preferredId; })) {
                        tradeFundingSourceSelect.value = fundingState.preferredId;
                    }
                    renderMarketOverview();
                    renderQuickTrade();
                    renderOverviewActivity(statementEntries, paymentSubmissions);
                    renderOverviewStrategyTable(portfolioPositions, tradeRecords);
                    renderStatementEntries(statementEntries);
                    renderTradeRecords(tradeRecords);
                    renderPortfolioPositions(portfolioPositions);
                    renderPlanFundingFlow();
                    renderPlanCalculator();
                    renderPaymentProofStatus();
                    if (notificationBadge) {
                        notificationBadge.textContent = String(pendingCount);
                    }
                    lastSessionRefreshAt = Date.now();
                    trackActivity({ force: true, refresh: false });
                    hideFeedback();
                } catch (error) {
                    show("error", "Dashboard Unavailable", error instanceof Error ? error.message : "Unable to load your dashboard.", window.location.protocol === "file:" ? "Use http://localhost so the session cookie can be reused." : "");
                }
            };

            const performLogout = async function (options) {
                if (logoutInProgress) return;
                logoutInProgress = true;

                const skipRemote = Boolean(options && options.skipRemote);
                const shouldBroadcast = !options || options.broadcast !== false;

                if (!skipRemote) {
                    try {
                        await fetch(api + "/auth/logout", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
                    } catch {}
                }

                if (shouldBroadcast) {
                    writeStoredTimestamp(LOGOUT_STORAGE_KEY, Date.now());
                }

                try {
                    localStorage.removeItem("novabit_authenticated_user");
                } catch {}

                window.location.href = "login.html";
            };

            const enforceIdleTimeout = function () {
                if (logoutInProgress) return;
                syncActivityFromStorage();
                if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS) return;
                void performLogout({ broadcast: true });
            };

            logoutButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    void performLogout();
                });
            });

            navLinks.forEach(function (link) {
                link.addEventListener("click", function (event) {
                    event.preventDefault();
                    setActiveView(link.getAttribute("href"), { history: "push" });
                });
            });

            if (profileMenuTrigger && profileMenu) {
                profileMenuTrigger.addEventListener("click", function () {
                    setProfileMenuOpen(profileMenu.hidden);
                });
            }

            featuredPlanCards.forEach(function (card) {
                resetPlanCardMotion(card);
                card.addEventListener("pointermove", function (event) {
                    updatePlanCardMotion(card, event);
                });
                card.addEventListener("pointerleave", function () {
                    resetPlanCardMotion(card);
                });
            });

            planSelectButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    applySelectedPlan(button.getAttribute("data-plan-select"));
                });
            });

            planMethodButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    setPlanFundingMethod(button.getAttribute("data-plan-method"));
                });
            });

            if (fundingMethodTrigger && fundingMethodPopup) {
                fundingMethodTrigger.addEventListener("click", function () {
                    trackActivity();
                    setFundingMethodPopupOpen(fundingMethodPopup.hidden);
                });
            }

            if (depositDetailCloseButton) {
                depositDetailCloseButton.addEventListener("click", function () {
                    closeDepositDetailModal();
                });
            }

            if (cryptoSelectorTrigger && cryptoSelectorPopup) {
                cryptoSelectorTrigger.addEventListener("click", function () {
                    trackActivity();
                    setCryptoSelectorOpen(cryptoSelectorPopup.hidden);
                });
            }

            cryptoAssetButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    setSelectedCryptoAsset(button.getAttribute("data-crypto-asset"));
                });
            });

            cardTypeButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    setSelectedCardType(button.getAttribute("data-card-type"));
                });
            });

            planCalculatorPresetButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    setPlanCalculatorAmount(button.getAttribute("data-plan-calc-preset"));
                });
            });

            planCalculatorModeButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    trackActivity();
                    setPlanCalculatorMode(button.getAttribute("data-plan-calc-mode"));
                });
            });

            if (planCalculatorAmountInput) {
                planCalculatorAmountInput.addEventListener("input", function () {
                    trackActivity();
                    if (!planCalculatorAmountInput.value.trim()) return;
                    renderPlanCalculator();
                });

                planCalculatorAmountInput.addEventListener("blur", function () {
                    if (!planCalculatorAmountInput.value.trim() || Number(planCalculatorAmountInput.value) < 0) {
                        setPlanCalculatorAmount(getSuggestedPlanAmount(PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth));
                        return;
                    }
                    renderPlanCalculator();
                });
            }

            if (planCalculatorRangeInput) {
                planCalculatorRangeInput.addEventListener("input", function () {
                    trackActivity();
                    setPlanCalculatorAmount(planCalculatorRangeInput.value);
                });
            }

            if (planCalculatorCyclesSelect) {
                planCalculatorCyclesSelect.addEventListener("change", function () {
                    trackActivity();
                    renderPlanCalculator();
                });
            }

            if (planCalculatorResetButton) {
                planCalculatorResetButton.addEventListener("click", function () {
                    trackActivity();
                    if (planCalculatorCyclesSelect) {
                        planCalculatorCyclesSelect.value = "1";
                    }
                    setPlanCalculatorMode("simple", { render: false });
                    setPlanCalculatorAmount(getSuggestedPlanAmount(PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth));
                });
            }

            if (planActivationAmountInput) {
                planActivationAmountInput.addEventListener("input", function () {
                    trackActivity();
                    if (!planActivationAmountInput.value.trim()) return;
                    renderPlanFundingFlow();
                });

                planActivationAmountInput.addEventListener("blur", function () {
                    const plan = PLAN_LIBRARY[selectedPlanKey] || PLAN_LIBRARY.growth;
                    const value = Number(planActivationAmountInput.value);
                    if (!planActivationAmountInput.value.trim() || !Number.isFinite(value) || value <= 0) {
                        planActivationAmountInput.value = String(getDefaultPlanFundingAmount(plan));
                        renderPlanFundingFlow();
                        return;
                    }

                    if (value > 250000) {
                        planActivationAmountInput.value = "250000";
                    }

                    renderPlanFundingFlow();
                });
            }

            if (paymentProofInput) {
                paymentProofInput.addEventListener("change", async function () {
                    trackActivity();
                    const file = paymentProofInput.files && paymentProofInput.files[0] ? paymentProofInput.files[0] : null;

                    if (!file) {
                        resetPaymentProofDraft();
                        return;
                    }

                    const mimeType = String(file.type || "").toLowerCase();
                    if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimeType)) {
                        resetPaymentProofDraft();
                        show("error", "Invalid Screenshot", "Upload a PNG, JPG, or WEBP proof screenshot.", "Other file types are not accepted for payment review.");
                        return;
                    }

                    if ((Number(file.size) || 0) > 4_000_000) {
                        resetPaymentProofDraft();
                        show("error", "Screenshot Too Large", "Use a smaller payment screenshot before you continue.", "Keep the file under 4 MB for a faster admin review.");
                        return;
                    }

                    try {
                        const dataUrl = await readFileAsDataUrl(file);
                        pendingPaymentProof = {
                            dataUrl: dataUrl,
                            fileName: file.name || "payment-proof",
                            mimeType: mimeType,
                            size: Number(file.size) || 0
                        };
                        renderPaymentProofStatus();
                    } catch (error) {
                        resetPaymentProofDraft();
                        show("error", "Screenshot Unavailable", error instanceof Error ? error.message : "Unable to read that payment screenshot.", "");
                    }
                });
            }

            if (depositHistoryList) {
                depositHistoryList.addEventListener("click", function (event) {
                    const uploadTrigger = event.target.closest("[data-payment-proof-pick]");
                    if (uploadTrigger) {
                        trackActivity();
                        openPaymentProofPicker();
                        return;
                    }

                    const submitTrigger = event.target.closest("[data-payment-proof-submit]");
                    if (submitTrigger) {
                        trackActivity();
                        void submitPaymentProof();
                        return;
                    }

                    const trigger = event.target.closest("[data-deposit-detail-reference]");
                    if (!trigger) return;
                    trackActivity();
                    openDepositDetailModal(trigger.getAttribute("data-deposit-detail-reference"));
                });
            }

            if (overviewStrategyList) {
                overviewStrategyList.addEventListener("click", function (event) {
                    const trigger = event.target.closest("[data-overview-open]");
                    if (!trigger) return;
                    trackActivity();
                    setActiveView("#" + trigger.getAttribute("data-overview-open"), { history: "push" });
                });
            }

            openButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    setActiveView(button.getAttribute("data-dashboard-open"), { history: "push" });
                });
            });

            if (tradeAssetSelect) {
                tradeAssetSelect.addEventListener("change", function () {
                    trackActivity();
                    selectedMarketSymbol = tradeAssetSelect.value;
                    renderMarketOverview();
                });
            }

            if (tradeFundingSourceSelect) {
                tradeFundingSourceSelect.addEventListener("change", function () {
                    trackActivity();
                    syncFundingPresentation();
                });
            }

            if (tradeAmountInput) {
                tradeAmountInput.addEventListener("input", function () {
                    trackActivity();
                });
            }

            if (tradeLeverageSelect) {
                tradeLeverageSelect.addEventListener("change", function () {
                    trackActivity();
                });
            }

            if (tradeExpirationSelect) {
                tradeExpirationSelect.addEventListener("change", function () {
                    trackActivity();
                });
            }

            if (tradeBuyButton) {
                tradeBuyButton.addEventListener("click", function () {
                    trackActivity();
                    handleTradePreview("buy");
                });
            }

            if (tradeSellButton) {
                tradeSellButton.addEventListener("click", function () {
                    trackActivity();
                    handleTradePreview("sell");
                });
            }

            copyButtons.forEach(function (button) {
                button.addEventListener("click", async function () {
                    const referralNode = document.querySelector('[data-field="referralUrl"]');
                    const referralValue = referralNode ? referralNode.textContent.trim() : "";
                    if (!referralValue) return;

                    try {
                        await navigator.clipboard.writeText(referralValue);
                        button.textContent = "Copied";
                        window.setTimeout(function () { button.textContent = "Copy"; }, 1400);
                    } catch {
                        show("error", "Copy Failed", "Unable to copy the referral link automatically.", "Please copy it manually from the field.");
                    }
                });
            });

            if (depositWalletCopyButton) {
                depositWalletCopyButton.addEventListener("click", async function () {
                    const addressNode = document.querySelector('[data-field="depositCryptoWalletAddress"]');
                    const addressValue = addressNode ? addressNode.textContent.trim() : "";
                    if (!addressValue) return;

                    try {
                        await navigator.clipboard.writeText(addressValue);
                        depositWalletCopyButton.textContent = "Copied";
                        window.setTimeout(function () { depositWalletCopyButton.textContent = "Copy Address"; }, 1400);
                    } catch {
                        show("error", "Copy Failed", "Unable to copy the wallet address automatically.", "Copy the address manually from the payment card.");
                    }
                });
            }

            window.addEventListener("hashchange", function () {
                setActiveView(window.location.hash, { updateHash: false, scroll: false });
            });

            window.addEventListener("popstate", function () {
                setActiveView(window.location.hash || "#overview", { updateHash: false, scroll: false });
            });

            document.addEventListener("click", function (event) {
                if (fundingMethodTrigger && fundingMethodPopup && !fundingMethodPopup.hidden) {
                    const methodShell = fundingMethodTrigger.closest(".user-deposit-method-shell");
                    if (methodShell && !methodShell.contains(event.target)) {
                        closeFundingMethodPopup();
                    }
                }

                if (cryptoSelectorShell && cryptoSelectorPopup && !cryptoSelectorPopup.hidden && !cryptoSelectorShell.contains(event.target)) {
                    closeCryptoSelector();
                }

                if (!profileMenuShell || !profileMenu || profileMenu.hidden) return;
                if (profileMenuShell.contains(event.target)) return;
                closeProfileMenu();
            });

            if (depositDetailModal) {
                depositDetailModal.addEventListener("click", function (event) {
                    if (event.target === depositDetailModal) {
                        closeDepositDetailModal();
                    }
                });
            }

            ["pointerdown", "touchstart", "scroll", "wheel"].forEach(function (eventName) {
                window.addEventListener(eventName, function () {
                    trackActivity();
                }, { passive: true });
            });

            window.addEventListener("focus", function () {
                syncActivityFromStorage();
                if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
                    void performLogout({ broadcast: true });
                    return;
                }
                trackActivity({ force: true });
            });

            document.addEventListener("visibilitychange", function () {
                if (document.visibilityState !== "visible") return;
                syncActivityFromStorage();
                if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
                    void performLogout({ broadcast: true });
                    return;
                }
                trackActivity({ force: true });
            });

            window.addEventListener("storage", function (event) {
                if (event.key === ACTIVITY_STORAGE_KEY && event.newValue) {
                    const value = Number(event.newValue);
                    if (Number.isFinite(value) && value > 0) {
                        lastActivityAt = Math.max(lastActivityAt, value);
                        lastActivityPersistedAt = Math.max(lastActivityPersistedAt, value);
                    }
                    return;
                }

                if (event.key === LOGOUT_STORAGE_KEY && event.newValue && !logoutInProgress) {
                    logoutInProgress = true;
                    window.location.href = "login.html";
                }
            });

            document.addEventListener("keydown", function (event) {
                trackActivity();
                if (event.key === "Escape") {
                    closeDepositDetailModal();
                    closeFundingMethodPopup();
                    closeCryptoSelector();
                    closeProfileMenu();
                }
            });

            document.addEventListener("DOMContentLoaded", function () {
                if (typeof lucide !== "undefined") lucide.createIcons();
                const initialView = window.location.hash ? normalizeView(window.location.hash) : "overview";
                setSelectedCryptoAsset(selectedCryptoAssetKey, { render: false });
                setSelectedCardType(selectedCardType, { render: false });
                setPlanFundingMethod(selectedFundingMethod, { render: false });
                applySelectedPlan(readStoredPlanKey(), { persist: false });
                setActiveView("#" + initialView, { history: "replace", scroll: false });
            });

            window.setInterval(enforceIdleTimeout, IDLE_CHECK_INTERVAL_MS);
            void load();
        })();
