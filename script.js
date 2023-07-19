var myRecords = [
  {
    route: "234A",
    bound: "O",
    stop: "0C4F5FC61E73367C",
    seq: 1,
    service_type: 1
  },
  {
    route: "234B",
    bound: "I",
    stop: "0C4F5FC61E73367C",
    seq: 1,
    service_type: 1
  },
  {
    route: "234A",
    bound: "I",
    stop: "966267086A03D688",
    seq: 1,
    service_type: 1
  },
  {
    route: "234A",
    bound: "I",
    stop: "060A70079F196C7C",
    seq: 2,
    service_type: 1
  },
  {
    route: "234A",
    bound: "I",
    stop: "003D1263A14908F6",
    seq: 3,
    service_type: 1
  },

  {
    route: "234B",
    bound: "O",
    stop: "966267086A03D688",
    seq: 1,
    service_type: 1
  },
  {
    route: "234B",
    bound: "O",
    stop: "060A70079F196C7C",
    seq: 2,
    service_type: 1
  },
  {
    route: "234B",
    bound: "O",
    stop: "003D1263A14908F6",
    seq: 3,
    service_type: 1
  },
  {
    route: "52X",
    bound: "O",
    stop: "8AFF8B43EC3E547F",
    seq: 25,
    service_type: 1
  },
  {
    route: "52X",
    bound: "I",
    stop: "1E4E9FB5763C3436",
    seq: 16,
    service_type: 1
  }
];

autoRefreshHook = null;

/*  Read / load data */
function declareDatabase() {
  const busDB = new Dexie("kmbBusDB");
  busDB.version(1).stores({
    kmb_routeList: "++,&[route+bound+service_type]",
    kmb_route_stops: "++,[route+bound],&[route+bound+stop]",
    kmb_stops: "stop"
  });
  return busDB;
}

busDB = declareDatabase();

busDB.open().catch(function (e) {
  console.error("Open failed: " + e.stack);
});

async function checkRouteInDB() {
  const allRoutes = await busDB.kmb_routeList.toArray();
  if (allRoutes.length === 0) {
    return $.ajax({
      url: `https://data.etabus.gov.hk/v1/transport/kmb/route/`
    }).then(function (rawData) {
      return busDB.kmb_routeList
        .bulkAdd(
          rawData.data.map((element) => {
            return {
              route: element.route,
              bound: element.bound,
              service_type: element.service_type,
              orig_en: element.orig_en,
              orig_tc: element.orig_tc,
              dest_en: element.dest_en,
              dest_tc: element.dest_tc
            };
          })
        )
        .then(function (addedData) {
          console.debug("routes written to store");
          return busDB.kmb_routeList.toArray();
        });
    });
  } else {
    console.debug("routes exist in store");
  }
  return allRoutes;
}

function createSelect2Options(obj) {
  const desc = `${obj.orig_tc} --> ${obj.dest_tc}`;
  // obj.bound === "O"
  // ? `${obj.orig_tc} --> ${obj.dest_tc}`
  // : `${obj.dest_tc} --> ${obj.orig_tc}`;
  return {
    text: `${obj.route}${obj.service_type === "2" ? "*" : ""} ${desc} -- ${
      obj.bound
    }`,
    id: `${obj.route}_${obj.bound}_${obj.service_type}`
  };
}

function loadDatabase() {
  return checkRouteInDB()
    .then((data) => {
      let inBoundData = [{ id: "-1", text: "Please select" }].concat(
        $.map(data, createSelect2Options)
      );
      $(".routeSelector")
        .select2({
          data: inBoundData.sort(function (a, b) {
            return a.id.localeCompare(b.id);
          })
        })
        .on("select2:select", function (evt) {
          // $(".routeSelector").select2({
          //   disabled: true
          // });
          handleRouteChange(evt.params.data.id);
        });
    })
    .catch((evt) => {
      console.error("Handling error");
      console.error(evt);
    });
}

/* UI init */
$(function () {
  new DataTable("#selectedRoute", {
    dom: "rti",
    select: { style: "multi" },
    autoWidth: false,
    paging: false,
    ordering: false,
    columns: [
      { data: "seq", width: "5%" },
      { data: "name_tc", width: "40%" },
      { data: "eta", width: "40%" },
      // { data: "stop", width: "10%", className: "stopID" }
    ],
    columnDefs: [
      {
        targets: 2,
        render: function (data, type, row, meta) {
          return data.replaceAll("\r\n", "<br/>");
        }
      }
    ]
  });

  new DataTable("#custom", {
    dom: "Brti",
    paging: false,
    ordering: false,
    columns: [
      { data: "route", width: "5%" },
      { data: "name_tc", width: "40%" },
      { data: "eta", width: "40%" }
    ],
    // data: etaRecords,
    columnDefs: [
      {
        targets: 1,
        render: function (data, type, row, meta) {
          return data.replaceAll("\r\n", "<br/>");
        }
      },
      {
        targets: 2,
        render: function (data, type, row, meta) {
          return data.replaceAll("\r\n", "<br/>");
        }
      }
    ],
    buttons: [
      {
        text: "Refresh",
        action: function (e, dt, node, config) {
          $(node).prop("disabled", true);
          refreshRegisteredETA().then(() => {
            $(node).prop("disabled", false);
          });
        }
      },
      {
        text: "Enable Auto Refresh (60 seconds)",
        action: function (e, dt, node, config) {
          if (autoRefreshHook === null || autoRefreshHook === undefined) {
            autoRefreshHook = setInterval(refreshRegisteredETA, 60 * 1000);
            node.text("Disable Auto Refresh");
          } else {
            clearInterval(autoRefreshHook);
            autoRefreshHook = null;
            node.text("Enable Auto Refresh (60 seconds)");
          }
        }
      },
      {
        text: "Refresh Database",
        action: function (e, dt, node, config) {
          // Clear datatables
          const etaTable = $("#custom").DataTable();
          etaTable.clear();
          etaTable.draw();
          const stopTable = $("#selectedRoute").DataTable();
          stopTable.clear();
          stopTable.draw();

          $(".routeSelector").select2().empty();

          // delete database
          busDB.delete().then(() => {
            window.busDB = declareDatabase();
            loadDatabase().then(() => refreshRegisteredETA());
          });
        }
      }
    ]
  });

  $("#selectedRoute")
    .DataTable()
    .on("select", function (e, dt, type, indexes) {
      if (type === "row") {
        var data = table.rows(indexes).data().pluck("stop");
        writeText(data);
      }
    });

  // Populate stop table and ETA table
  loadDatabase().then(() => refreshRegisteredETA());
});

function refreshRegisteredETA() {
  const etaTable = $("#custom").DataTable();
  etaTable.clear();
  etaTable.draw();
  // if (etaTable.data()?.length === 0) {
    return Promise.all(handleRegisteredETA()).then((etaRecords) => {
      etaTable.rows.add(etaRecords);
      etaTable.draw();
    });
//   }else{
//     // refresh the ETA column only
//     etaTable.data().map((etaRecord, idx) => {
      
//     })
//   }
}

function handleRouteChange(routeId) {
  const stopTable = $("#selectedRoute").DataTable();
  stopTable.clear();
  stopTable.draw();

  const routeParts = routeId.split("_");
  let now = Date.now();

  retrieveRouteStopData(routeParts[0], routeParts[1], routeParts[2])
    .then((routeStops) => {
      if (routeStops.length !== 0) {
        return routeStops.map(async (routeStopRecord) => {
          const stopRecord = await retrieveStopData(routeStopRecord.stop);
          const etaRecords = await retrieveEtaData(
            stopRecord.stop,
            routeParts[0],
            routeStopRecord.service_type
          );

          return {
            seq: routeStopRecord.seq,
            name_tc: stopRecord.name_tc,
            eta: buildRouteEta(etaRecords, routeStopRecord.bound),
            stop: routeStopRecord.stop
          };
        });
      } else {
        console.debug(
          `No stops of route ${routeParts[0] + "_" + routeParts[1]} returned`
        );
        return [];
      }
    })
    .then((etaPromises) => {
      Promise.all(etaPromises).then((etaArray) => {
        const stopTable = $("#selectedRoute").DataTable();
        stopTable.clear();
        stopTable.rows.add(etaArray);
        stopTable.draw();
      });
    });
}

async function retrieveRouteStopData(route, bound, service_type) {
  const result = await busDB.kmb_route_stops
    .where("[route+bound]")
    .equals([route, bound])
    .toArray();
  if (result.length === 0) {
    return $.ajax({
      url: `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${
        bound === "O" ? "outbound" : "inbound"
      }/${service_type}`
    }).then((routeStopRawData) => {
      // persist in database
      let routeStopData = routeStopRawData.data.map((element) => {
        return (({ route, bound, seq, stop, service_type }) => ({
          route,
          bound,
          seq,
          stop,
          service_type
        }))(element);
      });
      return busDB.kmb_route_stops
        .bulkAdd(routeStopData)
        .then(() => routeStopData);
    });
  } else {
    console.debug("Got route-stop data from indexeddb.");
    return result;
  }
}

async function retrieveStopData(stopID) {
  const result = await busDB.kmb_stops.where("stop").equals(stopID).first();
  if (result === undefined) {
    return $.ajax({
      url: `https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopID}`
    }).then((stopRawData) => {
      // persist in database
      let stopData = (({ stop, name_tc, name_en, lat, long }) => ({
        stop,
        name_tc,
        name_en,
        lat,
        long
      }))(stopRawData.data);
      return busDB.kmb_stops.add(stopData).then(
        () => stopData,
        () => busDB.kmb_stops.where("stop").equals(stopID).first()
      );
    });
  } else {
    console.debug("Got stop from indexeddb.");
    return result;
  }
}

function retrieveEtaData(stopID, route, serivce_type) {
  return $.ajax({
    url: `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopID}/${route}/${serivce_type}`
  }).then((etaRawData) => {
    // persist in database
    return etaRawData.data.map((element) => {
      return (({ route, dir, seq, stop, eta, eta_seq, service_type }) => ({
        route,
        dir,
        seq,
        stop,
        eta,
        eta_seq,
        service_type
      }))(element);
    });
  });
}

function buildRouteEta(etaRecords, bound) {
  return (etaStr = etaRecords.reduce((acc, cur) => {
    if (cur.dir == bound && cur.eta !== undefined && cur.eta !== null) {
      const nextBus = new Date(cur.eta);
      let timePart = nextBus.toTimeString(); //.toLocaleTimeString("zh-Hant-HK");
      timePart = timePart.slice(0, -38);
      const delta = (nextBus.getTime() - now) / 1000;
      let minutes = Math.floor(delta / 60);
      minutes = minutes < 1 ? "<1" : minutes.toString().padStart(2, "0");
      // const seconds = Math.floor(delta % 60);
      acc += `${minutes} mins (${timePart})` + "\r\n";
      return acc;
    }
    return acc;
  }, ""));
}

function handleRegisteredETA() {
  now = Date.now();
  return myRecords.map(buildETAObject);
}

async function buildETAObject(routeStopRecord, idx) {
  const stopRecord = await retrieveStopData(routeStopRecord.stop);
  const routeRecord = await busDB.kmb_routeList
    .where("[route+bound+service_type]")
    .equals([
      routeStopRecord.route,
      routeStopRecord.bound,
      routeStopRecord.service_type.toString()
    ])
    .first();

  let etaRecord = {
    route: routeStopRecord.route,
    seq: routeStopRecord.seq,
    name_tc: `${stopRecord.name_tc} \r\n-->${routeRecord?.dest_tc}`,
    eta: "pending",
    stop: routeStopRecord.stop
  };
  const etaRecords = retrieveEtaData(
    stopRecord.stop,
    routeStopRecord.route,
    routeStopRecord.service_type
  ).then((etas) => {
    const etaStr = buildRouteEta(etas, routeStopRecord.bound);
    etaRecord.eta = etaStr;
    const tblRow = $("#custom").DataTable().row(idx);
    let nRow = tblRow.data();
    if (nRow) {
      nRow.eta = etaStr;
      tblRow.data(nRow).draw();
    }
  });

  return etaRecord;
}
