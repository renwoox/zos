import log from '../helpers/log'
import { ZEPTOKEN_ATTRIBUTE_ID, ZEPTOKEN_ATTRIBUTE_DESCRIPTION, VALIDATOR_NAME, ZEPPELIN_ORG_NAME, ZEPPELIN_ORG_MAX_ADDRESSES } from '../constants'

export default async function configureTPL(jurisdiction, validator, options) {
  log.base('\n--------------------------------------------------------------------\n\n')
  await addValidator(jurisdiction, validator, options)
  await addAttributeType(jurisdiction, options)
  await addValidatorApproval(jurisdiction, validator, options)
  await createZeppelinOrganization(validator, options)
}

export async function addValidator(jurisdiction, validator, { txParams }) {
  log.base(`Adding Organizations validator ${validator.address} to the jurisdiction...`)
  try {
    await jurisdiction.addValidator(validator.address, VALIDATOR_NAME, txParams)
    log.info(` ✔ Organizations validator added`)
  } catch (error) {
    log.error(` ✘ Could not add Organizations validator to the jurisdiction`)
    throw error
  }
}

export async function addAttributeType(jurisdiction, { txParams }) {
  log.base(`Adding ZEP Token attribute ${ZEPTOKEN_ATTRIBUTE_ID} to the jurisdiction...`)
  try {
    await jurisdiction.addAttributeType(
      ZEPTOKEN_ATTRIBUTE_ID,
      ZEPTOKEN_ATTRIBUTE_DESCRIPTION,
      txParams
    )
    log.info(` ✔ ZEP Token attribute added`);
  } catch (error) {
    log.error(` ✘ Could not add ZEP Token attribute to the jurisdiction`)
    throw error
  }
}

export async function addValidatorApproval(jurisdiction, validator, { txParams }) {
  log.base(`Adding Organizations validator approval to the jurisdiction...`);
  try {
    await jurisdiction.addValidatorApproval(validator.address, ZEPTOKEN_ATTRIBUTE_ID, txParams)
    log.info(` ✔ Organizations validator approval added`);
  } catch (error) {
    log.error(` ✘ Could not add Organizations validator approval to the jurisdiction`)
    throw error
  }
}

export async function createZeppelinOrganization(validator, { txParams }) {
  log.base(`Creating Zeppelin organization for the OrganizationsValidator...`)
  try {
    await validator.addOrganization(txParams.from, ZEPPELIN_ORG_MAX_ADDRESSES, ZEPPELIN_ORG_NAME, txParams)
    log.info(` ✔ TPL Zeppelin organization created`)
  } catch (error) {
    log.error(` ✘ Could create Zeppelin organization for TPL`)
    throw error
  }
}
