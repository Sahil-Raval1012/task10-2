const AccessControl = artifacts.require("AccessControl");

contract("AccessControl", (accounts) => {
  let accessControl;
  const [admin, user1, user2] = accounts;
  
  const TRANSPORTER_ROLE = web3.utils.keccak256("TRANSPORTER_ROLE");

  beforeEach(async () => {
    accessControl = await AccessControl.new({ from: admin });
  });

  describe("Role Checking", () => {
    it("should return false for non-existent role", async () => {
      const hasRole = await accessControl.hasRole(TRANSPORTER_ROLE, user1);
      assert.equal(hasRole, false);
    });
  });
});
