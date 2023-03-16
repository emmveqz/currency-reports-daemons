
import CurrencyEnum               from "@emmveqz/currency-reports-core-enums/dist/CurrencyEnum"
import RateAlertBasisEnum         from "@emmveqz/currency-reports-core-enums/dist/RateAlertBasisEnum"
import RateAlertTypeEnum          from "@emmveqz/currency-reports-core-enums/dist/RateAlertTypeEnum"
import ICurrencyRateTicker        from "@emmveqz/currency-reports-core-interfaces/dist/ICurrencyRateTicker"
import ICurrencyRateTickerForMany from "@emmveqz/currency-reports-core-interfaces/dist/ICurrencyRateTickerForMany"
import {
  QryClause,
  SqlCond,
  SqlOptr,
}                                 from "@emmveqz/currency-reports-core-interfaces/dist/IQueryBuilder"
import AlertSuscription           from "@emmveqz/currency-reports-core/dist/bos/AlertSuscription"
import CurrencyRateTick           from "@emmveqz/currency-reports-core/dist/bos/CurrencyRateTick"
import BaseDao                    from "@emmveqz/currency-reports-core/dist/dao/BaseDao"
import MyDb                       from "@emmveqz/currency-reports-core/dist/dao/MyDb"
import CryptoCoinsRateTicker      from "@emmveqz/currency-reports-tools/dist/CryptoCoinsRateTicker"
import CryptoCoinsRateTickerWS    from "@emmveqz/currency-reports-tools/dist/CryptoCoinsRateTickerWS"
import BinanceUs                  from "@emmveqz/currency-reports-tools/dist/currency-endpoints/BinanceUs"
import BinanceWS                  from "@emmveqz/currency-reports-tools/dist/currency-endpoints/BinanceWS"
import {
  extractEnumNumbers,
  Sleep,
  Utils,
}                                 from "@emmveqz/currency-reports-tools/dist/Utils"
import * as nodemailer            from "nodemailer"
import {
  Options as EmailOptions,
}                                 from "nodemailer/lib/mailer"
import {
  Options as SmtpOptions,
}                                 from "nodemailer/lib/smtp-transport"
import config                     from "./config/my-config-vars"

//

type ITick = {
  price:	number,
  volume:	number,
}

type IRisingTendency = {
  currency:	CurrencyEnum,
  minPrice:	number,
  maxPrice:	number,
  /**
   * The minutes passed during the rising evaluation.
   */
  minutes:	number,
  /**
   * The percentage increment.
   */
  percentage:	number,
}

//

const ALERTS_FROM_EMAIL       = config.MYVAR_DAEMONS_ALERTS_FROM_EMAIL
const ALERTS_REPORTS_TO_EMAIL = config.MYVAR_DAEMONS_ALERTS_REPORTS_TO_EMAIL

const smtpConf: SmtpOptions	= {
  host: config.MYVAR_MAIL_SERVERHOST,
  port: config.MYVAR_MAIL_SMTPPORT,
  secure: true,
  auth: {
    user: config.MYVAR_DAEMONS_EMAILER,
    pass: config.MYVAR_DAEMONS_EMAILER_PASS,
  },
}

const endpoint = BinanceUs
const endpointForMany = BinanceWS

let currentTicker: ICurrencyRateTicker|ICurrencyRateTickerForMany
let canUseEmail     = false
const mailTransport = nodemailer.createTransport(smtpConf)

const db = new MyDb({
  Database:	config.MYVAR_CORE_DB_DEFAULTSCHEMA,
  Host:		config.MYVAR_CORE_DB_HOST,
  Pass:		config.MYVAR_CORE_DB_PASS,
  User:		config.MYVAR_CORE_DB_USER,
})
const dao = new BaseDao(db)

const ticksMaxMinutes = 136

/**
 * Where in the `Array` value, index `0` is the oldest value.
 */
const ticksData: { [enumId in CurrencyEnum]?: Array<ITick> } = {
}

const lastEmailTime: { [enumId in CurrencyEnum]?: number } = {
}

const lastAlertSubscrCheckTime: { [enumId in CurrencyEnum]?: number } = {
}

const lastRisingPercentage: { [enumId in CurrencyEnum]?: number } = {
}

//

const getTicker = (currency: CurrencyEnum): ICurrencyRateTicker => {
  /**
   * @ToDo We could (and should) use an object with its details for this purpose.
   */
  return currentTicker
}

const getTicksMaxLength = () => {
  return (ticksMaxMinutes * 60) / currentTicker.secsPerTick
}

/**
 * @Assumes `canUseEmail` flag must be set to `true`.
 */
const sendReportEmail = (currency: CurrencyEnum, error?: Error): Promise<nodemailer.SentMessageInfo> => {
  const html = error?.message ?? ``

  const emailConf: EmailOptions = {
    from: ALERTS_FROM_EMAIL,
    to: ALERTS_REPORTS_TO_EMAIL,
    cc: "",
    bcc: "",
    subject: `${CurrencyEnum[currency]} daemon stopped`,
    html,
    attachments: [],
  }

  return mailTransport.sendMail(emailConf)
}

const checkPeakVariation = (currency: CurrencyEnum) => {
  /**
   * @ToDo Implement.
   */
}

/**
 * @param currency
 * @returns `true` if tendency is rising, else `false`.
 *///
const checkRisingTendency = (currency: CurrencyEnum) => {
  const prices		= (ticksData[currency] || []).map((tick) => tick.price)

  if (prices.length < getTicksMaxLength() / 3) {
    return false
  }

  const ticksPerSecond	= 1 / currentTicker.secsPerTick
  const latestCount		= Math.round(ticksPerSecond * 120)
  /**
   * We want the last 120 seconds and
   * We disregard them from initial evaluations, using `splice`.
   */
  const latestPrices	= prices.splice(-latestCount)

  const maxPrice		= Math.max(...prices)
  const maxPriceIdx	= prices.findIndex((price) => price === maxPrice)

  /**
   * `prices` becomes the `secondHalfPrices` because of `splice`.
   */
  const firstHalfPrices	= prices.splice(0, maxPriceIdx)

  const firstMinPrice		= Math.min(...firstHalfPrices)
  const secondMinPrice	= Math.min(...prices)
  const lastMaxPrice		= Math.max(...latestPrices)

  const now					 = Date.now()
  const miliSecsPerEmail		 = 10 * 60 * 1000
  const miliSecsSinceLastEmail = now - (lastEmailTime[currency] || 0)
  const risingPercentage		 = (lastMaxPrice - firstHalfPrices[0]) / firstHalfPrices[0] * 100

  const rising = firstMinPrice < secondMinPrice && lastMaxPrice > maxPrice

  if (rising && miliSecsSinceLastEmail > miliSecsPerEmail && risingPercentage > 1.2 && risingPercentage > ((lastRisingPercentage[currency] || 0) + 1)) {
    sendRisingEmail({
      currency,
      maxPrice:	lastMaxPrice,
      minPrice:	firstMinPrice,
      minutes:	ticksMaxMinutes,
      percentage:	risingPercentage,
    })
    lastEmailTime[currency] = now
    lastRisingPercentage[currency] = risingPercentage
  } //

  return rising
}

const fillHistoryData = async (currency: CurrencyEnum): Promise<void> => {
  const latestTime = new Date( Date.now() - (ticksMaxMinutes * 60 * 1000) )

  const qry: QryClause = {
    Prop:	CurrencyRateTick.getPropNames(CurrencyRateTick).Currency,
    Optr:	SqlOptr.Equal,
    Val:	[currency],
    InnerClsCond:	SqlCond.AND,
    RightClauses:	[{
      Prop:	CurrencyRateTick.getPropNames(CurrencyRateTick).CreationDate,
      Optr:	SqlOptr.Greater,
      Val:	[Utils.DatetimeToString(latestTime)],
      InnerClsCond:	undefined,
      RightClauses:	undefined,
    }],
  } //

  const result = await dao
    .SkipOrder(false)
    .setOrderBy({
      Prop:	CurrencyRateTick.getPropNames(CurrencyRateTick).Id,
      Desc:	true,
    })
    .setPaging({
      Page: 1,
      Size: getTicksMaxLength(),
    })
    .Query(qry, CurrencyRateTick)

  dao.SkipOrder()

  if (result instanceof Error) {
    console.log(result)
    return
  } //

  ticksData[currency] = result.reverse().map( (obj) => ({
    price:	obj.Rate,
    volume:	obj.Volume,
  }) )

  console.log(
    CurrencyEnum[currency],
    "length:",
    ticksData[currency]?.length,
    "first price:",
    (ticksData[currency] || [])[0]?.price)
}

const fetchCurrency	= async (currency: CurrencyEnum): Promise<void> => {
  const ticker = currentTicker.Tick(currency)
  let rateTick: CurrencyRateTick
  let tick = await ticker.next()

  while (!tick.done) {
    rateTick = new CurrencyRateTick()

    rateTick.CreatedByUserId	= 1
    rateTick.Currency			= currency
    rateTick.Rate				= tick.value.rate
    rateTick.Volume				= tick.value.volume || 0

    const result = await dao.Create(rateTick)

    if (result instanceof Error) {
      console.log("error creating ratetick db record", result)
    }
    ticksData[currency]?.push({
      price: rateTick.Rate,
      volume: rateTick.Volume,
    });
    (ticksData[currency]?.length || 0) > getTicksMaxLength() && ticksData[currency]?.shift()

    checkPeakVariation(currency)
    checkRisingTendency(currency)

    await checkAlertSubscription(rateTick)
    tick = await ticker.next()
  }
  !canUseEmail || await sendReportEmail(currency)
}

const fetchCurrencies = async (currencies: Array<CurrencyEnum>): Promise<void> => {
  const ticker = (currentTicker as ICurrencyRateTickerForMany).TickMany(currencies)
  const secondsPerAlertSubscr = 5
  let now: number
  let daoResult: Error | CurrencyRateTick
  let rateTick: CurrencyRateTick
  let tick = await ticker.next()
  let error: Error|undefined
  const toDoDefineFlowOfLastError = await ticker.return()

  while (!tick.done) {
    if ( tick.value.error instanceof Error || tick.value.symbol === undefined || !currencies.includes(tick.value.symbol) ) {
      console.log(tick.value.error)
      error = tick.value.error
      tick = await ticker.next()
      continue
    }

    rateTick = new CurrencyRateTick()

    rateTick.CreatedByUserId	= 1
    rateTick.Currency			= tick.value.symbol
    rateTick.Rate				= tick.value.rate
    rateTick.Volume				= tick.value.volume || 0

    daoResult = await dao.Create(rateTick)

    if (daoResult instanceof Error) {
      console.log("error creating ratetick db record", daoResult)
    }

    ticksData[tick.value.symbol]?.push({
      price: rateTick.Rate,
      volume: rateTick.Volume,
    });
    (ticksData[tick.value.symbol]?.length || 0) > getTicksMaxLength() && ticksData[tick.value.symbol]?.shift()

    console.log(`ticksData.${CurrencyEnum[tick.value.symbol]}.length`, ticksData[tick.value.symbol]?.length)

    checkPeakVariation(tick.value.symbol)
    checkRisingTendency(tick.value.symbol)

    now = Date.now()

    if ( now - (lastAlertSubscrCheckTime[tick.value.symbol] || 0) > secondsPerAlertSubscr * 1000) {
    checkAlertSubscription(rateTick)
    lastAlertSubscrCheckTime[tick.value.symbol] = now
    }

    tick = await ticker.next()
  }
  !canUseEmail || await sendReportEmail(CurrencyEnum.BTC, error)
}

const getAlertSuscriptionQry = (currency: CurrencyEnum, basis: RateAlertBasisEnum, type: RateAlertTypeEnum, factor: number): QryClause => {
  return {
    Prop:	AlertSuscription.getPropNames(AlertSuscription).Currency,
    Optr:	SqlOptr.Equal,
    Val:	[currency],
    InnerClsCond: SqlCond.AND,
    RightClauses: [{
      Prop:	AlertSuscription.getPropNames(AlertSuscription).Type,
      Optr:	SqlOptr.Equal,
      Val:	[type],
      InnerClsCond: undefined,
      RightClauses: undefined,
      NextClsCond: SqlCond.AND,
    }, {
      Prop:	AlertSuscription.getPropNames(AlertSuscription).Basis,
      Optr:	SqlOptr.Equal,
      Val:	[basis],
      InnerClsCond: undefined,
      RightClauses: undefined,
      NextClsCond: SqlCond.AND,
    }, {
      Prop:	AlertSuscription.getPropNames(AlertSuscription).Factor,
      Optr:	type === RateAlertTypeEnum.Above ? SqlOptr.Less : SqlOptr.Greater,
      Val:	[factor],
      InnerClsCond: SqlCond.AND,
      RightClauses: [{
        Prop:	AlertSuscription.getPropNames(AlertSuscription).TimesToRemind,
        Optr:	SqlOptr.Greater,
        Val:	[0],
        InnerClsCond: undefined,
        RightClauses: undefined,
        NextClsCond: SqlCond.OR,
      }, {
        Prop:	AlertSuscription.getPropNames(AlertSuscription).TimesToRepeat,
        Optr:	SqlOptr.Greater,
        Val:	[0],
        InnerClsCond: undefined,
        RightClauses: undefined,
      }],
    }],
  }
} //

const markAlertAsSeen = (alert: AlertSuscription): Promise<boolean|Error> => {
  alert.TimesToRemind	= alert.TimesToRemind > 1 ? 1 : 0
  alert.TimesToRepeat	= 0
  alert.LastAlertDate	= Utils.DatetimeToString( new Date() )

  return dao.Update(alert)
}

/**
 * @Assumes `canUseEmail` flag must be set to `true`. //
 */
const sendRisingEmail = (props: IRisingTendency): Promise<nodemailer.SentMessageInfo> => {
  const html = `In the last ${props.minutes} minutes,
    <br/>
    min. price was ${props.minPrice}
    <br/>
    and max. price was ${props.maxPrice}
    <br/>
    As of ${Utils.DatetimeToString(new Date())}`

  const emailConf: EmailOptions = {
    from: ALERTS_FROM_EMAIL,
    /**
     * @ToDo Perhaps add an Entity for subscribing to Rising Tendencies.
     */
    to: ALERTS_REPORTS_TO_EMAIL,
    cc: "",
    bcc: "",
    subject: `${CurrencyEnum[props.currency]} on the rise %${parseFloat( String(props.percentage) ).toFixed(2)}`,
    html,
    attachments: [],
  }

  return mailTransport.sendMail(emailConf)
}

/**
 * @Assumes `canUseEmail` flag must be set to `true`.
 */
const sendAlertEmail = (currentRate: number, alert: AlertSuscription): Promise<nodemailer.SentMessageInfo> => {
  const action = alert.Type === RateAlertTypeEnum.Above
    ? ["risen", "above"]
    : ["dropped", "below"]

  const html = `${!alert.Memo ? `` : `Memo: `}${alert.Memo}.
    <br/>
    As of ${Utils.DatetimeToString(new Date())}`

  const emailConf: EmailOptions = {
    from: ALERTS_FROM_EMAIL,
    to: alert.Email,
    cc: "",
    bcc: "",
    subject: `${CurrencyEnum[alert.Currency]} ($${currentRate}) ${action[1]} $${alert.Factor}`,
    html,
    attachments: [],
  }

  return mailTransport.sendMail(emailConf)
}

const checkAlertSubscription = async (rateTick: CurrencyRateTick): Promise<void> => {
  const qry1 = getAlertSuscriptionQry(rateTick.Currency, RateAlertBasisEnum.Amount, RateAlertTypeEnum.Above, rateTick.Rate)
  const qry2 = getAlertSuscriptionQry(rateTick.Currency, RateAlertBasisEnum.Amount, RateAlertTypeEnum.Below, rateTick.Rate)

  const result1 = await dao.Query(qry1, AlertSuscription)
  const result2 = await dao.Query(qry2, AlertSuscription)

  const result = (result1 instanceof Error ? [] : result1).concat(result2 instanceof Error ? [] : result2)

  let markedAsSeen: boolean|Error
  let alert: AlertSuscription|undefined
  let sentEmailInfo: nodemailer.SentMessageInfo

  while ( (alert = result.pop()) ) {
    sentEmailInfo = !canUseEmail
      ? {}
      : ( await sendAlertEmail(rateTick.Rate, alert) )

    if (!sentEmailInfo || sentEmailInfo instanceof Error) {
      /**
       * @ToDo Do something
       */
    }
    !sentEmailInfo.messageId || Sleep(500)

    markedAsSeen = await markAlertAsSeen(alert)
  }
} //

(async () => {
  /**
   * If `true` then we use them "many" (web sockets) ticker.  
   * As of Mar/6/2023 Binance WS is broken, so let's not to.
   */
  const allCurrencies = process.argv[2] === "all"
  currentTicker = allCurrencies
    ? new CryptoCoinsRateTickerWS(endpointForMany)
    : new CryptoCoinsRateTicker(endpoint)

  if (allCurrencies) {
    const isWsOpen = await (currentTicker as ICurrencyRateTickerForMany).OpenWS()

    if (!isWsOpen || isWsOpen instanceof Error) {
      console.log("rate ticker error ", (isWsOpen || {}).message)
      return
    }
  }

  try {
    /**
     * @ToDo We need to implement some way to create a `mailTransport` instance everytime we want to send an email,
     * but not more than once in less than under (let's say) 10 minutes.
     */
    await mailTransport.verify()
    canUseEmail = true
  }
  catch (e) {
    //
    console.log(e)
  }
  console.log("canUseEmail", canUseEmail)

  const currencies = allCurrencies
    ? extractEnumNumbers(CurrencyEnum)
    : [CurrencyEnum.BTC]

  for (const currency of currencies) {
    await fillHistoryData(currency)
  }

  dao.setPaging({
    Page: 0,
    Size: 0,
  })

  if (allCurrencies) {
    await fetchCurrencies(currencies)
  }
  else {
    await fetchCurrency(currencies[0])
  }
})()
