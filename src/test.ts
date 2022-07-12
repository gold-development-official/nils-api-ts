import { NilsService } from ".";

const service = new NilsService({
  host: "https://nils-tst.gentco.com",
  email: "SA_TPT-NILS_DTA",
  rawPassword: "PPjdOmQEm88ozJyh1ENz",
  onError: (msg: any) => {
    console.log('on error!');
    console.error(msg);
  },
});

test();

async function test() {
  const user = await service.login(false).catch((err) => null);
  if (user) {
    console.log("welcome", user.full_name, `(${user.email})`);

    const result = await service.tatSyncAllLogisticRules().catch((err) => false);
    console.log(result);
  }
}
