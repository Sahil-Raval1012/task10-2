const SupplyChain = artifacts.require("SupplyChain");
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');

contract("SupplyChain", (accounts) => {
  let supplyChain;
  const [admin, manufacturer, transporter, customer] = accounts;
  
  const MANUFACTURER_ROLE = web3.utils.keccak256("MANUFACTURER_ROLE");
  const TRANSPORTER_ROLE = web3.utils.keccak256("TRANSPORTER_ROLE");
  
  beforeEach(async () => {
    supplyChain = await SupplyChain.new({ from: admin });
    await supplyChain.grantRole(MANUFACTURER_ROLE, manufacturer, { from: admin });
    await supplyChain.grantRole(TRANSPORTER_ROLE, transporter, { from: admin });
  });

  describe("Shipment Creation", () => {
    it("should allow manufacturer to create a shipment", async () => {
      const result = await supplyChain.createShipment(
        "Laptop",
        "Dell XPS 15",
        customer,
        "QmTest123",
        { from: manufacturer }
      );
      
      expectEvent(result, 'ShipmentCreated', {
        id: '1',
        manufacturer: manufacturer,
        productName: 'Laptop'
      });
      
      const shipment = await supplyChain.getShipment(1);
      assert.equal(shipment.productName, "Laptop");
      assert.equal(shipment.manufacturer, manufacturer);
      assert.equal(shipment.recipient, customer);
      assert.equal(shipment.status, '0'); // Created status
    });

    it("should not allow non-manufacturer to create shipment", async () => {
      await expectRevert(
        supplyChain.createShipment(
          "Laptop",
          "Dell XPS 15",
          customer,
          "QmTest123",
          { from: customer }
        ),
        "AccessControl: sender does not have required role"
      );
    });

    it("should increment shipment counter correctly", async () => {
      await supplyChain.createShipment("Product1", "Desc1", customer, "Hash1", { from: manufacturer });
      await supplyChain.createShipment("Product2", "Desc2", customer, "Hash2", { from: manufacturer });
      
      const counter = await supplyChain.shipmentCounter();
      assert.equal(counter.toString(), '2');
    });
  });

  describe("Location Updates", () => {
    let shipmentId;

    beforeEach(async () => {
      const result = await supplyChain.createShipment(
        "Laptop",
        "Dell XPS 15",
        customer,
        "QmTest123",
        { from: manufacturer }
      );
      shipmentId = result.logs[0].args.id.toString();
    });

    it("should allow current handler to update location", async () => {
      const result = await supplyChain.updateLocation(
        shipmentId,
        "37.7749",
        "-122.4194",
        { from: manufacturer }
      );
      expectEvent(result, 'LocationUpdated', {
        id: shipmentId,
        latitude: "37.7749",
        longitude: "-122.4194"
      });
      
      const locations = await supplyChain.getLocationHistory(shipmentId);
      assert.equal(locations.length, 1);
      assert.equal(locations[0].latitude, "37.7749");
      assert.equal(locations[0].longitude, "-122.4194");
    });

    it("should allow transporter to update location", async () => {
      await supplyChain.updateLocation(
        shipmentId,
        "40.7128",
        "-74.0060",
        { from: transporter }
      );
      
      const locations = await supplyChain.getLocationHistory(shipmentId);
      assert.equal(locations.length, 1);
    });

    it("should not allow unauthorized user to update location", async () => {
      await expectRevert(
        supplyChain.updateLocation(
          shipmentId,
          "37.7749",
          "-122.4194",
          { from: customer }
        ),
        "Not authorized"
      );
    });

    it("should track multiple location updates", async () => {
      await supplyChain.updateLocation(shipmentId, "37.7749", "-122.4194", { from: manufacturer });
      await supplyChain.updateLocation(shipmentId, "34.0522", "-118.2437", { from: manufacturer });
      await supplyChain.updateLocation(shipmentId, "40.7128", "-74.0060", { from: manufacturer });
      
      const locations = await supplyChain.getLocationHistory(shipmentId);
      assert.equal(locations.length, 3);
    });
  });

  describe("Status Updates", () => {
    let shipmentId;

    beforeEach(async () => {
      const result = await supplyChain.createShipment(
        "Laptop",
        "Dell XPS 15",
        customer,
        "QmTest123",
        { from: manufacturer }
      );
      shipmentId = result.logs[0].args.id.toString();
    });

    it("should allow status update to InTransit", async () => {
      const result = await supplyChain.updateStatus(
        shipmentId,
        1, // InTransit
        { from: manufacturer }
      );
      
      expectEvent(result, 'StatusUpdated', {
        id: shipmentId,
        status: '1'
      });
      
      const shipment = await supplyChain.getShipment(shipmentId);
      assert.equal(shipment.status, '1');
    });

    it("should mark shipment as delivered and inactive", async () => {
      const result = await supplyChain.updateStatus(
        shipmentId,
        4, // Delivered
        { from: manufacturer }
      );
      
      expectEvent(result, 'ShipmentDelivered');
      
      const shipment = await supplyChain.getShipment(shipmentId);
      assert.equal(shipment.status, '4');
      assert.equal(shipment.isActive, false);
      assert.notEqual(shipment.deliveredAt, '0');
    });

    it("should not allow status update on inactive shipment", async () => {
      await supplyChain.updateStatus(shipmentId, 4, { from: manufacturer });
      
      await expectRevert(
        supplyChain.updateStatus(shipmentId, 1, { from: manufacturer }),
        "Shipment not active"
      );
    });
  });

  describe("Handler Transfer", () => {
    let shipmentId;

    beforeEach(async () => {
      const result = await supplyChain.createShipment(
        "Laptop",
        "Dell XPS 15",
        customer,
        "QmTest123",
        { from: manufacturer }
      );
      shipmentId = result.logs[0].args.id.toString();
    });

    it("should transfer handler successfully", async () => {
      const result = await supplyChain.transferHandler(
        shipmentId,
        transporter,
        { from: manufacturer }
      );
      
      expectEvent(result, 'HandlerChanged', {
        id: shipmentId,
        oldHandler: manufacturer,
        newHandler: transporter
      });
      
      const shipment = await supplyChain.getShipment(shipmentId);
      assert.equal(shipment.currentHandler, transporter);
    });

    it("should not allow non-handler to transfer", async () => {
      await expectRevert(
        supplyChain.transferHandler(shipmentId, transporter, { from: customer }),
        "Not current handler"
      );
    });

    it("should add shipment to new handler's list", async () => {
      await supplyChain.transferHandler(shipmentId, transporter, { from: manufacturer });
      
      const transporterShipments = await supplyChain.getUserShipments(transporter);
      assert.equal(transporterShipments.length, 1);
      assert.equal(transporterShipments[0].toString(), shipmentId);
    });
  });

  describe("Query Functions", () => {
    let shipmentId1, shipmentId2;

    beforeEach(async () => {
      const result1 = await supplyChain.createShipment(
        "Product1",
        "Description1",
        customer,
        "Hash1",
        { from: manufacturer }
      );
      shipmentId1 = result1.logs[0].args.id.toString();
      
      const result2 = await supplyChain.createShipment(
        "Product2",
        "Description2",
        customer,
        "Hash2",
        { from: manufacturer }
      );
      shipmentId2 = result2.logs[0].args.id.toString();
    });

    it("should return correct shipment details", async () => {
      const shipment = await supplyChain.getShipment(shipmentId1);
      
      assert.equal(shipment.id, shipmentId1);
      assert.equal(shipment.productName, "Product1");
      assert.equal(shipment.description, "Description1");
      assert.equal(shipment.manufacturer, manufacturer);
      assert.equal(shipment.recipient, customer);
      assert.equal(shipment.ipfsHash, "Hash1");
    });

    it("should return user shipments correctly", async () => {
      const manufacturerShipments = await supplyChain.getUserShipments(manufacturer);
      const customerShipments = await supplyChain.getUserShipments(customer);
      
      assert.equal(manufacturerShipments.length, 2);
      assert.equal(customerShipments.length, 2);
    });

    it("should return empty array for user with no shipments", async () => {
      const shipments = await supplyChain.getUserShipments(accounts[9]);
      assert.equal(shipments.length, 0);
    });
  });

  describe("Access Control", () => {
    it("should grant manufacturer role", async () => {
      const hasRole = await supplyChain.hasRole(MANUFACTURER_ROLE, manufacturer);
      assert.equal(hasRole, true);
    });

    it("should allow admin to manage roles", async () => {
      await supplyChain.grantRole(MANUFACTURER_ROLE, accounts[5], { from: admin });
      const hasRole = await supplyChain.hasRole(MANUFACTURER_ROLE, accounts[5]);
      assert.equal(hasRole, true);
    });

    it("should prevent non-admin to grant roles", async () => {
      await expectRevert(
        supplyChain.grantRole(MANUFACTURER_ROLE, accounts[5], { from: manufacturer }),
        "AccessControl: sender does not have required role"
      );
    });

    it("should allow admin to revoke", async () => {
      await supplyChain.revokeRole(MANUFACTURER_ROLE, manufacturer, { from: admin });
      const hasRole = await supplyChain.hasRole(MANUFACTURER_ROLE, manufacturer);
      assert.equal(hasRole, false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle shipment ", async () => {
      const result = await supplyChain.createShipment(
        "Product",
        "Description",
        customer,
        "",
        { from: manufacturer }
      );
      
      const shipmentId = result.logs[0].args.id.toString();
      const shipment = await supplyChain.getShipment(shipmentId);
      assert.equal(shipment.ipfsHash, "");
    });

    it("should handle multiple location updates", async () => {
      const result = await supplyChain.createShipment(
        "Product",
        "Description",
        customer,
        "Hash",
        { from: manufacturer }
      );
      const shipmentId = result.logs[0].args.id.toString();
      
      for (let i = 0; i < 5; i++) {
        await supplyChain.updateLocation(
          shipmentId,
          `${37 + i}`,
          `${-122 + i}`,
          { from: manufacturer }
        );
      }
      
      const locations = await supplyChain.getLocationHistory(shipmentId);
      assert.equal(locations.length, 5);
    });
  });
});
