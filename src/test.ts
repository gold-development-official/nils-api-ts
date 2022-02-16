import { CostLine, NilsService } from ".";

const service = new NilsService({
  host: "https://nils-tst.gentco.com",
  email: "SA_TPT-NILS_DTA",
  password: "35bac76dcc2bec3dff074e6362a689ba30eb5b49",
  // host: "https://nils.gentco.com",
  // email: "SA_TPT-NILS_P",
  // password: "73ded56f5d7699cafb3501ae4dce93f587e3347f",
  onError: (msg: any) => {
    console.error(msg);
  },
});

test();

async function test() {
  const user = await service.login(false).catch((err) => null);
  if (user) {
    console.log("welcome", user.full_name, `(${user.email})`);
  }
}
