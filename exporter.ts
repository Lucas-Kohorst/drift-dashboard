import { BN, Provider, Wallet } from '@project-serum/anchor';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
    ClearingHouse,
    ClearingHouseUser,
    initialize,
    DriftEnv,
    PositionDirection,
    QUOTE_PRECISION,
    FUNDING_PAYMENT_PRECISION,
    BN_MAX,
    Markets,
} from '@drift-labs/sdk';

require('dotenv').config();
var pg = require('pg');
var format = require('pg-format');

type User = {
    publicKey: PublicKey,
    buyingPower: BN,
    canBeLiquidated: Boolean,
    marginRatio: BN,
    leverage: BN,
    totalCollateral: BN,
    totalPositionValue: BN
    freeCollateral: BN,
    maxLeverage: BN,
    unrealizedPnLWithFunding: BN,
    unrealizedPnL: BN,
}

type Market = {
    initialized: Boolean,
    baseAssetAmountLong: BN,
    baseAssetAmountShort: BN,
    baseAssetAmount: BN,
    openInterest: BN,
    baseAssetReserve: BN,
    quoteAssetReserve: BN,
    cumulativeRepegRebateLong: BN,
    cumulativeRepegRebateShort: BN,
    cumulativeFundingRateLong: BN,
    cumulativeFundingRateShort: BN,
    lastFundingRate: BN,
    lastFundingRateTs: BN,
    fundingPeriod: BN,
    lastOracleMarkSpreadTwap: BN,
    lastMarkPriceTwap: BN,
    lastMarkPriceTwapTs: BN,
    sqrtK: BN,
    pegMultiplier: BN,
    totalFee: BN,
    totalFeeMinusDistributions: BN,
    totalFeeWithdrawn: BN,
    minimumTradeSize: BN,
    symbol: String,
    baseAssetSymbol: String,
    devnetPythOracle: String,
    mainnetPythOracle: String,
    marketIndex: BN,
}

const main = async () => {
    // Initialize Drift SDK
    const sdkConfig = initialize({ env: 'mainnet-beta' as DriftEnv });

    // Set up the Wallet and Provider
    const privateKey: string = process.env.PRIVATE_KEY as string;
    const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(privateKey))
    );
    const wallet = new Wallet(keypair);

    // Set up the Connection
    const rpcAddress: string = process.env.RPC_ADDRESS as string;
    const connection = new Connection(rpcAddress);

    // Set up the Provider
    const provider = new Provider(connection, wallet, Provider.defaultOptions());

    console.log(`Initialized connection...`)

    // Set up the Drift Clearing House
    const clearingHousePublicKey = new PublicKey(
        sdkConfig.CLEARING_HOUSE_PROGRAM_ID
    );

    const clearingHouse = ClearingHouse.from(
        connection,
        provider.wallet,
        clearingHousePublicKey
    );

    let sub = await clearingHouse.subscribe();

    // Connecting to Postgres DB
    var connectionString = "postgres://postgres:password@host.docker.internal:5432/drift";
    var pgClient = new pg.Client(connectionString);
    pgClient.connect();
    
    console.log(`Database Connected to: ${pgClient.database}`)

    // User Information
    const users: ClearingHouseUser[] = [];
    const getUserInformation = async () => {
        console.log('Adding User Data');
        const programUserAccounts = await clearingHouse.program.account.user.all();
        for (const programUserAccount of programUserAccounts) {
            const user = ClearingHouseUser.from(
                clearingHouse,
                programUserAccount.account.authority
            );
            await user.subscribe();
            users.push(user);

            let u: User = {
                publicKey: user.getUserAccount().authority, // public key of the account to liquidate
                buyingPower: user.getBuyingPower().div(QUOTE_PRECISION), // Free Collateral * MAX_LEVERAGE, dividing by 1M to bring value into normal decimals
                canBeLiquidated: user.canBeLiquidated()[0], // true|false if able to liquidate
                marginRatio: user.canBeLiquidated()[1].div(new BN(100)), // total collateral / |total position value|, @dev if totalPositionValue == 0 then marginRatio == BN_MAX
                leverage: user.getLeverage().div(FUNDING_PAYMENT_PRECISION), // Total Notional Position Size divided by Total Collateral
                totalCollateral: user.getTotalCollateral().div(QUOTE_PRECISION), // The total USD value of collateral (Wallet Balance +/- UnrealisedPnL)
                totalPositionValue: user.getTotalPositionValue().div(QUOTE_PRECISION), // sum of all positions value
                freeCollateral: user.getFreeCollateral().div(QUOTE_PRECISION), // The value of collateral that can be used to open new positions
                maxLeverage: user.getMaxLeverage().div(FUNDING_PAYMENT_PRECISION), // Max Leverage,
                unrealizedPnLWithFunding: user.getUnrealizedPNL(true).div(QUOTE_PRECISION), // unrealized pnl with funding
                unrealizedPnL: user.getUnrealizedPNL(false).div(QUOTE_PRECISION) // unrealized pnl w/ out funding
            }   

            let sql = format("SELECT public_key FROM drift_user where public_key = %L;", user.getUserAccount().authority.toString())
            pgClient.query(sql,
                (err: any, res: any) => {
                    if (err != null) {
                        console.log("Error Querying the Database")
                        console.log(err)
                        pgClient.end()
                        process.exit(-1)
                    }

                    if (res.rows.length > 0) {
                        let values = [
                            u.publicKey.toString(),
                            u.buyingPower.toNumber(),
                            u.canBeLiquidated,
                            u.marginRatio.toNumber(),
                            u.leverage.toNumber(),
                            u.totalCollateral.toNumber(),
                            u.totalPositionValue.toNumber(),
                            u.freeCollateral.toNumber(),
                            u.maxLeverage.toNumber(),
                            u.unrealizedPnLWithFunding.toNumber(),
                            u.unrealizedPnL.toNumber(),
                        ]

                        // Insert Values into the Market
                        let sql = format('INSERT INTO drift_user_position (public_key, buying_power, can_be_liquidated, margin_ratio, leverage, total_collateral, total_position_value, free_collateral, max_leverage, unrealized_pnl_with_funding, unrealized_pnl) VALUES (%L)', values)
                        pgClient.query(sql, (err: any, res: any) => {
                            if (err == null) console.log(`Updated User ${u.publicKey.toString()}`);
                            else console.log(err);
                        });
                    } else {
                        let values = [
                            u.publicKey.toString()
                        ]

                        // Insert Values into the drift_user_data
                        let sql = format('INSERT INTO drift_user (public_key) VALUES (%L)', values)
                        pgClient.query(sql, (err: any, res: any) => {
                            if (err == null) console.log(`Added User ${u.publicKey.toString()}`);
                            else console.log(err);
                        });
                    }
                }
            )
        }
    };

    // Market Information
    const marketsAccount: any = clearingHouse.getMarketsAccount();
    let counter: any = 0;
    const getMarketInformation = async () => {
        Markets.forEach((market: any) => {
            let marketData: any = marketsAccount.markets[counter];
            let m: Market = {
                initialized: marketData.initialized,
                baseAssetAmountLong: marketData.baseAssetAmountLong,
                baseAssetAmountShort: marketData.baseAssetAmountShort,
                baseAssetAmount: marketData.baseAssetAmount,
                openInterest: marketData.openInterest,
                baseAssetReserve: marketData.amm.baseAssetReserve,
                quoteAssetReserve: marketData.amm.quoteAssetReserve,
                cumulativeRepegRebateLong: marketData.amm.cumulativeRepegRebateLong,
                cumulativeRepegRebateShort: marketData.amm.cumulativeRepegRebateShort,
                cumulativeFundingRateLong: marketData.amm.cumulativeFundingRateLong,
                cumulativeFundingRateShort: marketData.amm.cumulativeFundingRateShort,
                lastFundingRate: marketData.amm.lastFundingRate,
                lastFundingRateTs: marketData.amm.lastFundingRateTs,
                fundingPeriod: marketData.amm.fundingPeriod,
                lastOracleMarkSpreadTwap: marketData.amm.lastOracleMarkSpreadTwap,
                lastMarkPriceTwap: marketData.amm.lastMarkPriceTwap,
                lastMarkPriceTwapTs: marketData.amm.lastMarkPriceTwapTs,
                sqrtK: marketData.amm.sqrtK,
                pegMultiplier: marketData.amm.pegMultiplier,
                totalFee: marketData.amm.totalFee,
                totalFeeMinusDistributions: marketData.amm.totalFeeMinusDistributions,
                totalFeeWithdrawn: marketData.amm.totalFeeWithdrawn,
                minimumTradeSize:  marketData.amm.minimumTradeSize,
                symbol: market.symbol,
                baseAssetSymbol: market.baseAssetSymbol,
                devnetPythOracle: market.devnetPythOracle,
                mainnetPythOracle: market.mainnetPythOracle,
                marketIndex: market.marketIndex,
            }

            pgClient.query(
                "SELECT count(*) FROM drift_market;",
                (err: any, res: any) => {
                    if (err != null) {
                        console.log("Error Querying the Database")
                        pgClient.end()
                        process.exit(-1)
                    }

                    // Checking if there are values in the drift_market already
                    if (res.rows[0].count > 0) {
                        console.log(`Updating Market Data for ${res.rows[0].count} market(s)`);

                        // @dev all values are divided by 1000 so there are enough bits to convert
                        let values = [
                            m.symbol,
                            m.baseAssetAmountLong.div(new BN(1000)).toNumber(),
                            m.baseAssetAmountShort.div(new BN(1000)).toNumber(),
                            m.baseAssetAmount.div(new BN(1000)).toNumber(),
                            m.openInterest.div(new BN(1000)).toNumber(),
                            m.baseAssetReserve.div(new BN(1000)).toNumber(),
                            m.quoteAssetReserve.div(new BN(1000)).toNumber(),
                            m.cumulativeRepegRebateLong.div(new BN(1000)).toNumber(),
                            m.cumulativeRepegRebateShort.div(new BN(1000)).toNumber(),
                            m.cumulativeFundingRateLong.div(new BN(1000)).toNumber(),
                            m.cumulativeFundingRateShort.div(new BN(1000)).toNumber(),
                            m.lastFundingRate.div(new BN(1000)).toNumber(),
                            m.lastFundingRateTs.div(new BN(1000)).toNumber(),
                            m.fundingPeriod.div(new BN(1000)).toNumber(),
                            m.lastOracleMarkSpreadTwap.div(new BN(1000)).toNumber(),
                            m.lastMarkPriceTwap.div(new BN(1000)).toNumber(),
                            m.lastMarkPriceTwapTs.div(new BN(1000)).toNumber(),
                            m.sqrtK.div(new BN(1000)).toNumber(),
                            m.pegMultiplier.div(new BN(1000)).toNumber(),
                            m.totalFee.div(new BN(1000)).toNumber(),
                            m.totalFeeMinusDistributions.div(new BN(1000)).toNumber(),
                            m.totalFeeWithdrawn.div(new BN(1000)).toNumber(),
                            m.minimumTradeSize.div(new BN(1000)).toNumber(),
                            m.marketIndex.div(new BN(1000)).toNumber()
                        ]

                        // Insert Values into the Market
                        let sql = format('INSERT INTO drift_market_data (symbol, baseAssetAmountLong, baseAssetAmountShort, baseAssetAmount, openInterest, baseAssetReserve, quoteAssetReserve, cumulativeRepegRebateLong, cumulativeRepegRebateShort, cumulativeFundingRateLong, cumulativeFundingRateShort, lastFundingRate, lastFundingRateTs, fundingPeriod, lastOracleMarkSpreadTwap, lastMarkPriceTwap, lastMarkPriceTwapTs, sqrtK, pegMultiplier, totalFee, totalFeeMinusDistributions, totalFeeWithdrawn, minimumTradeSize, marketIndex) VALUES (%L)', values)
                        pgClient.query(sql, (err: any, res: any) => {
                            if (err == null) console.log(`Updated Market ${m.symbol}`);
                            else console.log(err);
                        });
                    } else {
                        let values = [
                            m.initialized,
                            m.symbol,
                            m.baseAssetSymbol,
                            m.devnetPythOracle,
                            m.mainnetPythOracle
                        ]
                    
                        // Insert Values into the Market
                        let sql = format('INSERT INTO drift_market (initialized, symbol, baseAssetSymbol, devnetPythOracle, mainnetPythOracle) VALUES (%L)', values)
                        pgClient.query(sql, (err: any, res: any) => {
                            if (err == null) console.log(`Inserted New Market ${m.symbol}`);
                            else console.log(err);
                        });
                    }
                }
            )
            counter++
        }) 
    };


    // start initial loop 
    await getMarketInformation();
    await getUserInformation();
    
    // Repeat
    await setInterval(getMarketInformation, 60000);
    await setInterval(getUserInformation, 60000);
}
main()
