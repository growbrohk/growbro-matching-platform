/**
 * Event charge currencies and Stripe card-fee rules.
 *
 * HKD: 3.4% + HK$2.35.
 * Any other currency: 5.9% (3.4% base + 0.5% international card + 2% conversion)
 * plus HK$2.35 converted to a static rounded amount in that currency.
 *
 * The checkout edge function imports this module so the preview and the charge match.
 */

export const HKD_STRIPE_FEE_RATE = 0.034;
export const NON_HKD_STRIPE_FEE_RATE = 0.059;
export const HKD_STRIPE_FIXED_FEE = 2.35;

export const NON_HKD_STRIPE_FEE_EXPLANATION =
  '5.9% covers the 3.4% card fee, 0.5% for an international card, and 2% for currency conversion.';

/** ISO codes Stripe treats as zero-decimal (amount is already the minor unit). */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** ISO zero-decimal, but Stripe requires a two-decimal amount divisible by 100. */
const STRIPE_WHOLE_UNIT = new Set(['ISK', 'UGX']);

/** Charged in thousandths; Stripe requires the minor-unit amount to be divisible by 10. */
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export interface StripeCurrency {
  code: string;
  name: string;
}

/**
 * Stripe presentment currencies.
 * The third value is approximate units of that currency per 1 HKD, used only
 * to convert the HK$2.35 fixed fee. These are static estimates, not live FX.
 */
const CURRENCY_ROWS: Array<[string, string, number]> = [
  ['AED', 'United Arab Emirates dirham', 0.4708],
  ['AFN', 'Afghan afghani', 8.85],
  ['ALL', 'Albanian lek', 11.4],
  ['AMD', 'Armenian dram', 49.5],
  ['ANG', 'Netherlands Antillean guilder', 0.229],
  ['AOA', 'Angolan kwanza', 118],
  ['ARS', 'Argentine peso', 148],
  ['AUD', 'Australian dollar', 0.196],
  ['AWG', 'Aruban florin', 0.229],
  ['AZN', 'Azerbaijani manat', 0.218],
  ['BAM', 'Bosnia-Herzegovina convertible mark', 0.231],
  ['BBD', 'Barbadian dollar', 0.256],
  ['BDT', 'Bangladeshi taka', 15.5],
  ['BGN', 'Bulgarian lev', 0.231],
  ['BHD', 'Bahraini dinar', 0.0483],
  ['BIF', 'Burundian franc', 375],
  ['BMD', 'Bermudian dollar', 0.1282],
  ['BND', 'Brunei dollar', 0.168],
  ['BOB', 'Bolivian boliviano', 0.887],
  ['BRL', 'Brazilian real', 0.72],
  ['BSD', 'Bahamian dollar', 0.1282],
  ['BTN', 'Bhutanese ngultrum', 10.9],
  ['BWP', 'Botswana pula', 1.74],
  ['BYN', 'Belarusian ruble', 0.42],
  ['BZD', 'Belize dollar', 0.256],
  ['CAD', 'Canadian dollar', 0.178],
  ['CDF', 'Congolese franc', 368],
  ['CHF', 'Swiss franc', 0.113],
  ['CLP', 'Chilean peso', 122],
  ['CNY', 'Chinese yuan', 0.92],
  ['COP', 'Colombian peso', 535],
  ['CRC', 'Costa Rican colón', 65],
  ['CVE', 'Cape Verdean escudo', 13.1],
  ['CZK', 'Czech koruna', 2.96],
  ['DJF', 'Djiboutian franc', 22.8],
  ['DKK', 'Danish krone', 0.881],
  ['DOP', 'Dominican peso', 7.75],
  ['DZD', 'Algerian dinar', 17.2],
  ['EGP', 'Egyptian pound', 6.4],
  ['ETB', 'Ethiopian birr', 15.8],
  ['EUR', 'Euro', 0.118],
  ['FJD', 'Fijian dollar', 0.29],
  ['FKP', 'Falkland Islands pound', 0.101],
  ['GBP', 'British pound', 0.101],
  ['GEL', 'Georgian lari', 0.35],
  ['GIP', 'Gibraltar pound', 0.101],
  ['GMD', 'Gambian dalasi', 9.2],
  ['GNF', 'Guinean franc', 1110],
  ['GTQ', 'Guatemalan quetzal', 0.99],
  ['GYD', 'Guyanese dollar', 26.8],
  ['HKD', 'Hong Kong dollar', 1],
  ['HNL', 'Honduran lempira', 3.26],
  ['HTG', 'Haitian gourde', 16.8],
  ['HUF', 'Hungarian forint', 46.5],
  ['IDR', 'Indonesian rupiah', 2090],
  ['ILS', 'Israeli new shekel', 0.472],
  ['INR', 'Indian rupee', 10.9],
  ['ISK', 'Icelandic króna', 17.6],
  ['JMD', 'Jamaican dollar', 20.1],
  ['JOD', 'Jordanian dinar', 0.0908],
  ['JPY', 'Japanese yen', 19.3],
  ['KES', 'Kenyan shilling', 16.6],
  ['KGS', 'Kyrgyzstani som', 11.2],
  ['KHR', 'Cambodian riel', 515],
  ['KMF', 'Comorian franc', 58.1],
  ['KRW', 'South Korean won', 178],
  ['KWD', 'Kuwaiti dinar', 0.0394],
  ['KYD', 'Cayman Islands dollar', 0.1068],
  ['KZT', 'Kazakhstani tenge', 67],
  ['LAK', 'Lao kip', 2780],
  ['LBP', 'Lebanese pound', 11480],
  ['LKR', 'Sri Lankan rupee', 38.6],
  ['LRD', 'Liberian dollar', 25.6],
  ['LSL', 'Lesotho loti', 2.26],
  ['MAD', 'Moroccan dirham', 1.28],
  ['MDL', 'Moldovan leu', 2.26],
  ['MGA', 'Malagasy ariary', 585],
  ['MKD', 'Macedonian denar', 7.28],
  ['MMK', 'Myanmar kyat', 269],
  ['MNT', 'Mongolian tugrik', 435],
  ['MOP', 'Macanese pataca', 1.03],
  ['MUR', 'Mauritian rupee', 5.95],
  ['MVR', 'Maldivian rufiyaa', 1.98],
  ['MWK', 'Malawian kwacha', 223],
  ['MXN', 'Mexican peso', 2.56],
  ['MYR', 'Malaysian ringgit', 0.568],
  ['MZN', 'Mozambican metical', 8.2],
  ['NAD', 'Namibian dollar', 2.26],
  ['NGN', 'Nigerian naira', 198],
  ['NIO', 'Nicaraguan córdoba', 4.72],
  ['NOK', 'Norwegian krone', 1.39],
  ['NPR', 'Nepalese rupee', 17.4],
  ['NZD', 'New Zealand dollar', 0.216],
  ['OMR', 'Omani rial', 0.0493],
  ['PAB', 'Panamanian balboa', 0.1282],
  ['PEN', 'Peruvian sol', 0.478],
  ['PGK', 'Papua New Guinean kina', 0.53],
  ['PHP', 'Philippine peso', 7.45],
  ['PKR', 'Pakistani rupee', 35.8],
  ['PLN', 'Polish zloty', 0.505],
  ['PYG', 'Paraguayan guarani', 990],
  ['QAR', 'Qatari rial', 0.467],
  ['RON', 'Romanian leu', 0.588],
  ['RSD', 'Serbian dinar', 13.8],
  ['RUB', 'Russian ruble', 12.6],
  ['RWF', 'Rwandan franc', 176],
  ['SAR', 'Saudi riyal', 0.481],
  ['SBD', 'Solomon Islands dollar', 1.07],
  ['SCR', 'Seychellois rupee', 1.84],
  ['SEK', 'Swedish krona', 1.36],
  ['SGD', 'Singapore dollar', 0.171],
  ['SHP', 'Saint Helena pound', 0.101],
  ['SLE', 'Sierra Leonean leone', 2.92],
  ['SOS', 'Somali shilling', 73],
  ['SRD', 'Surinamese dollar', 4.65],
  ['SZL', 'Swazi lilangeni', 2.26],
  ['THB', 'Thai baht', 4.42],
  ['TJS', 'Tajikistani somoni', 1.37],
  ['TND', 'Tunisian dinar', 0.398],
  ['TOP', 'Tongan paʻanga', 0.302],
  ['TRY', 'Turkish lira', 4.65],
  ['TTD', 'Trinidad and Tobago dollar', 0.87],
  ['TWD', 'New Taiwan dollar', 4.16],
  ['TZS', 'Tanzanian shilling', 338],
  ['UAH', 'Ukrainian hryvnia', 5.35],
  ['UGX', 'Ugandan shilling', 472],
  ['USD', 'United States dollar', 0.1282],
  ['UYU', 'Uruguayan peso', 5.35],
  ['UZS', 'Uzbekistan som', 1640],
  ['VND', 'Vietnamese dong', 3260],
  ['VUV', 'Vanuatu vatu', 15.4],
  ['WST', 'Samoan tala', 0.355],
  ['XAF', 'Central African CFA franc', 77.4],
  ['XCD', 'East Caribbean dollar', 0.346],
  ['XOF', 'West African CFA franc', 77.4],
  ['XPF', 'CFP franc', 14.1],
  ['YER', 'Yemeni rial', 32.1],
  ['ZAR', 'South African rand', 2.31],
  ['ZMW', 'Zambian kwacha', 3.45],
];

const UNITS_PER_HKD: Record<string, number> = Object.fromEntries(
  CURRENCY_ROWS.map(([code, , units]) => [code, units]),
);

export const STRIPE_CURRENCIES: StripeCurrency[] = [...CURRENCY_ROWS]
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => {
    if (a.code === 'HKD') return -1;
    if (b.code === 'HKD') return 1;
    return a.code.localeCompare(b.code);
  });

const CURRENCY_NAME = new Map(STRIPE_CURRENCIES.map((c) => [c.code, c.name]));

export function normalizeCurrency(currency: string | null | undefined): string {
  const code = (currency || 'HKD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : 'HKD';
}

export function isKnownCurrency(currency: string | null | undefined): boolean {
  return CURRENCY_NAME.has(normalizeCurrency(currency));
}

export function currencyOptionLabel(currency: string | null | undefined): string {
  const code = normalizeCurrency(currency);
  const name = CURRENCY_NAME.get(code);
  return name ? `${code} — ${name}` : code;
}

export function moneyFractionDigits(currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL.has(code) || STRIPE_WHOLE_UNIT.has(code)) return 0;
  return 2;
}

export function roundMoney(amount: number, currency: string | null | undefined): number {
  const digits = moneyFractionDigits(currency);
  const factor = 10 ** digits;
  return Math.round((Number(amount) || 0) * factor) / factor;
}

/** Stripe `unit_amount` for a major-unit price. */
export function toStripeMinorUnits(amount: number, currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  const rounded = roundMoney(amount, code);
  if (ZERO_DECIMAL.has(code)) return Math.round(rounded);
  if (STRIPE_WHOLE_UNIT.has(code)) return Math.round(rounded) * 100;
  if (THREE_DECIMAL.has(code)) return Math.round(rounded * 1000);
  return Math.round(rounded * 100);
}

export function fromStripeMinorUnits(minor: number, currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL.has(code)) return minor;
  if (THREE_DECIMAL.has(code)) return minor / 1000;
  return minor / 100;
}

export function formatMoney(amount: number, currency: string | null | undefined = 'HKD'): string {
  const code = normalizeCurrency(currency);
  const digits = moneyFractionDigits(code);
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(digits)}`;
  }
}

export function formatMoneyTotals(amounts: Record<string, number> | null | undefined): string {
  const entries = Object.entries(amounts || {})
    .filter(([, n]) => Number.isFinite(n) && Math.abs(n) > 0.000001)
    .sort(([a], [b]) => {
      if (a === 'HKD') return -1;
      if (b === 'HKD') return 1;
      return a.localeCompare(b);
    });
  if (entries.length === 0) return formatMoney(0, 'HKD');
  return entries.map(([code, amount]) => formatMoney(amount, code)).join(' · ');
}

export function addMoneyAmount(
  totals: Record<string, number>,
  currency: string | null | undefined,
  amount: number,
): void {
  const n = Number(amount) || 0;
  if (!n) return;
  const code = normalizeCurrency(currency);
  totals[code] = (totals[code] || 0) + n;
}

export function scaleMoneyTotals(
  totals: Record<string, number>,
  factor: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, amount] of Object.entries(totals)) {
    out[code] = amount * factor;
  }
  return out;
}

export function mergeMoneyTotals(
  into: Record<string, number>,
  add: Record<string, number>,
): void {
  for (const [code, amount] of Object.entries(add)) {
    into[code] = (into[code] || 0) + amount;
  }
}

export function hasPositiveMoney(totals: Record<string, number> | null | undefined): boolean {
  return Object.values(totals || {}).some((n) => n > 0);
}

/** HKD amount when present, otherwise the largest currency total. Used only for sorting. */
export function primaryMoneyAmount(totals: Record<string, number> | null | undefined): number {
  const map = totals || {};
  if (map.HKD) return map.HKD;
  let max = 0;
  for (const n of Object.values(map)) {
    if (n > max) max = n;
  }
  return max;
}

export function getStripeFeeRate(currency: string | null | undefined): number {
  return normalizeCurrency(currency) === 'HKD' ? HKD_STRIPE_FEE_RATE : NON_HKD_STRIPE_FEE_RATE;
}

export function getStripeFixedFee(currency: string | null | undefined): number {
  const code = normalizeCurrency(currency);
  if (code === 'HKD') return HKD_STRIPE_FIXED_FEE;
  const perHkd = UNITS_PER_HKD[code];
  if (perHkd == null) {
    return moneyFractionDigits(code) === 0 ? 45 : 0.3;
  }
  return roundMoney(HKD_STRIPE_FIXED_FEE * perHkd, code);
}

export function getStripeFee(currency: string | null | undefined = 'HKD'): { rate: number; fixed: number } {
  return {
    rate: getStripeFeeRate(currency),
    fixed: getStripeFixedFee(currency),
  };
}

export function formatStripeFeeLabel(currency: string | null | undefined = 'HKD'): string {
  const { rate, fixed } = getStripeFee(currency);
  const pct = `${(rate * 100).toFixed(1)}%`;
  return `${pct} + ${formatMoney(fixed, currency)}`;
}
