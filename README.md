```
drift-sdk > postgres > grafana 
```

### Run postgress 
```
docker pull postgres:latest
docker volume create postgres-volume
docker run -d --name=postgres -p 5432:5432 -v postgres-volume:/var/lib/postgresql/data -e POSTGRES_PASSWORD=password postgres

// Connecting to the Database
docker exec -it postgres psql --username=postgres

// Creating the Database
CREATE DATABASE drift;

// Create new role 
CREATE ROLE drift  LOGIN SUPERUSER PASSWORD 'password';

// Creating tables
 CREATE TABLE DRIFT_USER(
    PUBLIC_KEY VARCHAR(500) NOT NULL,
    PRIMARY KEY(PUBLIC_KEY)
 );

 CREATE TABLE DRIFT_USER_POSITION(
   PUBLIC_KEY VARCHAR(500) NOT NULL,
   PUBLISHED_TIME TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   BUYING_POWER BIGINT NOT NULL,
   CAN_BE_LIQUIDATED BOOLEAN NOT NULL,
   MARGIN_RATIO BIGINT NOT NULL,
   LEVERAGE BIGINT NOT NULL,
   TOTAL_COLLATERAL BIGINT NOT NULL,
   TOTAL_POSITION_VALUE BIGINT NOT NULL,
   FREE_COLLATERAL BIGINT NOT NULL,
   MAX_LEVERAGE BIGINT NOT NULL,
   UNREALIZED_PNL_WITH_FUNDING BIGINT NOT NULL,
   UNREALIZED_PNL BIGINT NOT NULL,
   PRIMARY KEY(PUBLISHED_TIME),
   CONSTRAINT fk_public_key
       FOREIGN KEY(PUBLIC_KEY) 
       REFERENCES drift_user(PUBLIC_KEY)
 );

 CREATE TABLE DRIFT_MARKET(
  PUBLISHED_TIME TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  initialized BOOLEAN NOT NULL,
  symbol VARCHAR(500) NOT NULL,
  baseAssetSymbol VARCHAR(500) NOT NULL,
  devnetPythOracle VARCHAR(500) NOT NULL,
  mainnetPythOracle VARCHAR(500) NOT NULL,
  PRIMARY KEY(symbol)
 );

 CREATE TABLE DRIFT_MARKET_DATA(
  symbol VARCHAR(500) NOT NULL,
  PUBLISHED_TIME TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  baseAssetAmountLong BIGINT NOT NULL,
  baseAssetAmountShort BIGINT NOT NULL,
  baseAssetAmount BIGINT NOT NULL,
  openInterest BIGINT NOT NULL,
  baseAssetReserve BIGINT NOT NULL,
  quoteAssetReserve BIGINT NOT NULL,
  cumulativeRepegRebateLong BIGINT NOT NULL,
  cumulativeRepegRebateShort BIGINT NOT NULL,
  cumulativeFundingRateLong BIGINT NOT NULL,
  cumulativeFundingRateShort BIGINT NOT NULL,
  lastFundingRate BIGINT NOT NULL,
  lastFundingRateTs BIGINT NOT NULL,
  fundingPeriod BIGINT NOT NULL,
  lastOracleMarkSpreadTwap BIGINT NOT NULL,
  lastMarkPriceTwap BIGINT NOT NULL,
  lastMarkPriceTwapTs BIGINT NOT NULL,
  sqrtK BIGINT NOT NULL,
  pegMultiplier BIGINT NOT NULL,
  totalFee BIGINT NOT NULL,
  totalFeeMinusDistributions BIGINT NOT NULL,
  totalFeeWithdrawn BIGINT NOT NULL,
  minimumTradeSize BIGINT NOT NULL,
  marketIndex BIGINT NOT NULL,
 PRIMARY KEY(PUBLISHED_TIME),
 CONSTRAINT fk_public_key
     FOREIGN KEY(symbol) 
     REFERENCES drift_market(symbol)
 );
```

### Viewing Data in the Database 
```
\c drift
select * from drift_user join drift_user_position on drift_user.public_key = drift_user_position.public_key;

select * from drift_market join drift_market_data on drift_market.symbol = drift_market_data.symbol;
```

## Running 
```
docker-compose up -d
```

## TODO 
- [x] Trader Leaderboard 
- [ ] Accounts that Can be Liquidated 
- [ ] Fix Decimals
- [ ] All in Docker
- [ ] Add in Loops