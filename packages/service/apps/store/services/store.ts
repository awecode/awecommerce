import { eq } from 'drizzle-orm'
import { ValidationError } from '../../../core/errors'
import { storeSettings, UpdateStoreSettings } from '../schemas'
import { Database } from '../../types'

// Store settings are a single row with this id
const SETTINGS_ID = 1

// Node has it; the ES2016 types this package compiles against do not
const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf(key: 'currency'): string[] })
  .supportedValuesOf

// The currency's code in capitals, if Intl knows it
const standardCurrency = (currency: string) => {
  const code = currency.toUpperCase()
  if (!supportedValuesOf('currency').includes(code)) {
    throw new ValidationError(`Unknown currency: ${currency}`)
  }
  return code
}

// The locale's standard form, such as en-US for en-us
const standardLocale = (locale: string) => {
  try {
    return Intl.getCanonicalLocales(locale)[0]!
  } catch {
    throw new ValidationError(`Unknown locale: ${locale}`)
  }
}

class StoreSettingsService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async getSettings() {
    const findSetting = () =>
      this.db.query.storeSettings.findFirst({
        columns: { id: false },
        where: eq(storeSettings.id, SETTINGS_ID),
      })
    const setting = await findSetting()
    if (setting) {
      return setting
    }
    await this.db
      .insert(storeSettings)
      .values({ id: SETTINGS_ID })
      .onConflictDoNothing()
    return (await findSetting())!
  }

  // Changes the given settings and returns all of them
  async updateSettings(data: UpdateStoreSettings) {
    const changes = {
      ...data,
      ...(data.currency !== undefined ? { currency: standardCurrency(data.currency) } : {}),
      ...(data.locale !== undefined ? { locale: standardLocale(data.locale) } : {}),
    }
    if (Object.keys(changes).length) {
      await this.db
        .insert(storeSettings)
        .values({ ...changes, id: SETTINGS_ID })
        .onConflictDoUpdate({ target: storeSettings.id, set: changes })
    }
    return await this.getSettings()
  }
}

export { StoreSettingsService }
