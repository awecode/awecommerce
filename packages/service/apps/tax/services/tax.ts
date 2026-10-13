import { eq } from 'drizzle-orm'
import { Decimal } from 'decimal.js'
import { taxSettings, UpdateTaxSettings } from '../schemas'
import { Database } from '../../types'

// Tax settings are a single row with this id
const SETTINGS_ID = 1

// Tax on an amount at a percentage rate, rounded to 2 decimal places. When the
// amount already includes tax, the tax is split out of it instead of added.
const calculateTax = (
  amount: Decimal.Value,
  rate: Decimal.Value,
  pricesIncludeTax: boolean,
) => {
  const value = new Decimal(amount)
  const percentage = new Decimal(rate)
  const tax = pricesIncludeTax
    ? value.mul(percentage).div(percentage.add(100))
    : value.mul(percentage).div(100)
  return tax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

class TaxService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async getSettings() {
    const findSetting = () =>
      this.db.query.taxSettings.findFirst({
        columns: {
          id: false,
        },
        where: eq(taxSettings.id, SETTINGS_ID),
      })
    const setting = await findSetting()
    if (setting) {
      return setting
    }
    await this.db
      .insert(taxSettings)
      .values({ id: SETTINGS_ID })
      .onConflictDoNothing()
    return (await findSetting())!
  }

  async updateSettings(data: UpdateTaxSettings) {
    if (!Object.keys(data).length) {
      return
    }
    await this.db
      .insert(taxSettings)
      .values({ ...data, id: SETTINGS_ID })
      .onConflictDoUpdate({
        target: taxSettings.id,
        set: data,
      })
  }
}

export { calculateTax, TaxService }
