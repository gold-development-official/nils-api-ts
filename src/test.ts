import { NilsService } from ".";

const service = new NilsService({
  host: "https://nils-acc.gentco.com",
  email: "SA_TPT-NILS_DTA",
  password: "35bac76dcc2bec3dff074e6362a689ba30eb5b49",
  onError: (msg: any) => {
    console.error(msg);
  },
});

test();

async function test() {
  const user = await service.login(false).catch((err) => null);
  if (user) {
    console.log("welcome", user.full_name, `(${user.email})`);

    console.log("Retrieving cost lines for", 60003603);
    const costLines = await service.costLines(60003603).catch((err) => null);
    if (costLines) {
      for (const line of costLines) {
        console.log(
          line.costLineType,
          line.baseCurrencySymbol,
          line.baseCurrency,
          line.amountInBaseCurrency
        );
      }
    } else {
      console.log("No rates available");
    }

    console.log("Retrieving cost lines for", 60006183);
    const noCostLines = await service.costLines(60006183).catch((err) => null);
    if (noCostLines) {
      for (const line of noCostLines) {
        console.log(
          line.costLineType,
          line.baseCurrencySymbol,
          line.baseCurrency,
          line.amountInBaseCurrency
        );
      }
    } else {
      console.log("No rates available");
    }

    console.log('Request TPT Job Sync');
    const requestedJobSync = await service.tptSyncAllJobs();
    console.log('Requested job sync?', requestedJobSync);

    console.log('Request TPT Vendor Sync');
    const requestedVendorSync = await service.tptSyncAllVendors();
    console.log('Requested vendor sync?', requestedVendorSync);

    console.log('Request TPT Rate Sync');
    const requestedRateSync = await service.tptSyncAllRates();
    console.log('Requested rate sync?', requestedRateSync);
  }
}
