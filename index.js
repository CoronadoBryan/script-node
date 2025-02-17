const xlsx = require("xlsx");
const mysql = require("mysql2");
require("dotenv").config();

// Conexión a la base de datos
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});



connection.connect((err) => {
  if (err) {
    console.error("Error conectando a la base de datos:", err);
    return;
  }
  console.log("Conectado a la base de datos");
});




// Leer archivo Excel principal excel 1 
const workbook = xlsx.readFile("C:\\Users\\Ryzen 3\\Desktop\\script-node\\datata.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

// Leer el segundo archivo Excel para obtener información adicional
const workbookAdditionalData = xlsx.readFile("C:\\Users\\Ryzen 3\\Desktop\\script-node\\datata2.xlsx");
const sheetNameAdditionalData = workbookAdditionalData.SheetNames[0];
const sheetAdditionalData = workbookAdditionalData.Sheets[sheetNameAdditionalData];
const additionalUserData = xlsx.utils.sheet_to_json(sheetAdditionalData);

// Crear un mapa de username a los otros campos
const userInfoMap = {};
additionalUserData.forEach((row) => {
  const username = row["username"] ? row["username"].toString().trim() : null;
  if (username) {
    userInfoMap[username] = {
      fname: row["fname"] ? row["fname"].toString().trim() : null,
      lname: row["lname"] ? row["lname"].toString().trim() : null,
      password: row["password"] ? row["password"].toString().trim() : null,
      verification_code: row["verification_code"] ? row["verification_code"].toString().trim() : null,
      ev: row["ev"] ? parseInt(row["ev"], 10) : 0,
      kyc: row["kyc"] ? parseInt(row["kyc"], 10) : 0,
      kyc_infos: row["kyc_infos"] && row["kyc_infos"] !== "NULL" ? JSON.stringify(JSON.parse(row["kyc_infos"])) : null,
      payment_method: row["metodo_cobro"] ? row["metodo_cobro"].toString().trim() : null,
      account_wallet: row["cuenta_wallet"] ? row["cuenta_wallet"].toString().trim() : null,
      email: row["email"] ? row["email"].toString().trim() : null,
      phone: row["phone"] ? row["phone"].toString().trim() : null,
      country: row["address"] && row["address"] !== "NULL" ? JSON.parse(row["address"]).country : null
    };
  }
});

// Reiniciar el contador de IDs
const resetAutoIncrement = () => {
  const query = `ALTER TABLE users AUTO_INCREMENT = 1`;
  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error reiniciando AUTO_INCREMENT:", err);
    } else {
      console.log("AUTO_INCREMENT reiniciado correctamente");
      insertDataWithoutReferredBy();
    }
  });
};

// Insertar datos en MySQL sin reffered_by
const insertDataWithoutReferredBy = () => {
  let pendingQueries = data.length; // Contador de consultas pendientes

  data.forEach((row) => {
    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    // Obtener información del mapa
    const userInfo = userInfoMap[username] || {};
    const email = userInfo.email || null;
    const phone = userInfo.phone || null;
    const country = userInfo.country || null;
    const fname = userInfo.fname || null;
    const lname = userInfo.lname || null;
    const password = userInfo.password || null;
    const verification_code = userInfo.verification_code || null;
    const ev = userInfo.ev;
    const kyc = userInfo.kyc;
    const kyc_infos = userInfo.kyc_infos || null;
    const payment_method = userInfo.payment_method || null;
    const account_wallet = userInfo.account_wallet || null;

    // Obtener balance y balance_disponible de la columna "Inversión en USDT"
    const balance = row["Inversión en USDT"] ? parseFloat(row["Inversión en USDT"]) : 0;
    const balance_disponible = balance; // Asumimos que el balance disponible es igual al balance inicial

    // Definir status
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status === "VALIDADO") {
      status = 1;
    } else if (status === "BAJA") {
      status = 10;
    } else {
      status = 0;
    }

    // Obtener las fechas actuales para created_at y updated_at
    const createdAt = new Date();
    const updatedAt = new Date();

    // Imprimir valores antes de la inserción para depuración
    console.log(`Insertando/actualizando usuario: ${username}, fname: ${fname}, lname: ${lname}, balance: ${balance}`);

    const insertQuery = `
      INSERT INTO users (username, email, phone, country, status, fname, lname, password, verification_code, ev, kyc, kyc_infos, payment_method, account_wallet, balance, balance_disponible, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      email = VALUES(email), 
      phone = VALUES(phone), 
      country = VALUES(country), 
      status = VALUES(status), 
      fname = VALUES(fname),
      lname = VALUES(lname),
      password = VALUES(password),
      verification_code = VALUES(verification_code),
      ev = VALUES(ev),
      kyc = VALUES(kyc),
      kyc_infos = VALUES(kyc_infos),
      payment_method = VALUES(payment_method),
      account_wallet = VALUES(account_wallet),
      balance = VALUES(balance),
      balance_disponible = VALUES(balance_disponible),
      updated_at = VALUES(updated_at)
    `;
    const values = [username, email, phone, country, status, fname, lname, password, verification_code, ev, kyc, kyc_infos, payment_method, account_wallet, balance, balance_disponible, createdAt, updatedAt];

    connection.query(insertQuery, values, (err, results) => {
      if (err) {
        console.error("Error insertando o actualizando datos:", err);
        process.exit(1); // Detener el script si ocurre un error
      } else {
        console.log("Dato insertado o actualizado correctamente:", results.insertId);
      }
      // Decrementar el contador de consultas pendientes
      pendingQueries--;
      if (pendingQueries === 0) {
        updateReferredBy(); // Llamar a la función para actualizar reffered_by
      }
    });
  });
};

// Actualizar reffered_by
const updateReferredBy = () => {
  let pendingUpdates = data.length; // Contador de actualizaciones pendientes

  data.forEach((row) => {
    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    const codigoReferido = row["CODIGO REFERIDO"]
      ? row["CODIGO REFERIDO"].toString().trim()
      : null;

    if (codigoReferido) {
      const query = `SELECT id FROM users WHERE username = ?`;
      connection.query(query, [codigoReferido], (err, results) => {
        if (err) {
          console.error("Error buscando usuario referido:", err);
          process.exit(1); // Detener el script si ocurre un error
        } else if (results.length > 0) {
          completeUpdate(results[0].id);
        } else {
          completeUpdate(null);
        }
      });
    } else {
      completeUpdate(null);
    }

    function completeUpdate(refferedBy) {
      const updateQuery = `
        UPDATE users SET reffered_by = ? WHERE username = ?
      `;
      const values = [refferedBy, username];

      connection.query(updateQuery, values, (err, results) => {
        if (err) {
          console.error("Error actualizando reffered_by:", err);
          process.exit(1); // Detener el script si ocurre un error
        } else {
          console.log("reffered_by actualizado correctamente para:", username);
        }
        // Decrementar el contador de actualizaciones pendientes
        pendingUpdates--;
        if (pendingUpdates === 0) {
          connection.end(); // Cerrar conexión cuando todas las actualizaciones hayan terminado
        }
      });
    }
  });
};

// Iniciar el proceso
resetAutoIncrement();
