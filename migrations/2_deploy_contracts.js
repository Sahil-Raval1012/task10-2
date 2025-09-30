const AccessControl = artifacts.require("AccessControl");
const SupplyChain = artifacts.require("SupplyChain");

module.exports = async function (deployer, network, accounts) {
  // Deploy AccessControl first
  await deployer.deploy(AccessControl);
  
  // Deploy SupplyChain
  await deployer.deploy(SupplyChain);
  
  const supplyChain = await SupplyChain.deployed();
  
  // Grant roles to test accounts
  const MANUFACTURER_ROLE = web3.utils.keccak256("MANUFACTURER_ROLE");
  const TRANSPORTER_ROLE = web3.utils.keccak256("TRANSPORTER_ROLE");
  
  if (network === 'development') {
    await supplyChain.grantRole(MANUFACTURER_ROLE, accounts[1]);
    await supplyChain.grantRole(TRANSPORTER_ROLE, accounts[2]);
    console.log("Roles granted to test accounts");
  }
};