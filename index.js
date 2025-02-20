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
  connectTimeout: 20000 // Aumentar el tiempo de espera a 10 segundos
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
const sheetName = "Afiliados"; // Especificar el nombre de la hoja directamente
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
const resetAutoIncrement = (tableName) => {
  const query = `ALTER TABLE ${tableName} AUTO_INCREMENT = 0`;
  connection.query(query, (err, results) => {
    if (err) {
      console.error(`Error reiniciando AUTO_INCREMENT en ${tableName}:`, err);
    } else {
      console.log(`AUTO_INCREMENT reiniciado correctamente en ${tableName}`);
    }
  });
};

// Insertar datos en MySQL en la tabla users
const insertDataIntoUsers = () => {
  resetAutoIncrement('users'); // Reiniciar AUTO_INCREMENT en users

  let pendingQueries = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length; // Contador de consultas pendientes solo para "VALIDADO"

  data.forEach((row) => {
    // Definir status
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    // Solo procesar si el estado es "VALIDADO"
    if (status !== "VALIDADO") {
      return; // Omitir esta fila si no está validada
    }

    // Convertir status a número
    status = 1; // Asignar 1 para "VALIDADO"

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

    // Obtener balance basado en la lógica de la columna "ACUMULA"
    let balance;
    if (row["ACUMULA"] && row["ACUMULA"].toString().trim().toUpperCase() === "ACUMULA") {
      balance = row["Total Afiliacion + Rendimientos"] ? parseFloat(row["Total Afiliacion + Rendimientos"]) : null;
    } else {
      balance = row["Capital + Upgrades"] ? parseFloat(row["Capital + Upgrades"]) : 0;
    }

    // Asegurarse de que balance no sea NaN
    if (isNaN(balance)) {
      balance = null;
    }

    const balance_disponible = 0; // Asumimos que el balance disponible es igual al balance inicial

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
  let pendingUpdates = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length; // Contador de actualizaciones pendientes solo para "VALIDADO"

  data.forEach((row) => {
    // Definir status
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    // Solo procesar si el estado es "VALIDADO"
    if (status !== "VALIDADO") {
      return; // Omitir esta fila si no está validada
    }

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
          insertDataIntoLicences(); // Llamar a la función para insertar en licences después de actualizar reffered_by
        }
      });
    }
  });
};



// Insertar datos en MySQL en la tabla licences
const insertDataIntoLicences = () => {
  resetAutoIncrement('licences'); // Reiniciar AUTO_INCREMENT en licences

  let pendingQueries = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length; // Contador de consultas pendientes solo para "VALIDADO"

  data.forEach((row) => {
    // Definir status
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    // Solo procesar si el estado es "VALIDADO"
    if (status !== "VALIDADO") {
      return; // Omitir esta fila si no está validada
    }

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    // Obtener el ID del usuario desde la tabla users
    const userQuery = `SELECT id FROM users WHERE username = ?`;
    connection.query(userQuery, [username], (err, results) => {
      if (err) {
        console.error("Error buscando usuario:", err);
        process.exit(1); // Detener el script si ocurre un error
      } else if (results.length > 0) {
        const userId = results[0].id;

        // Determinar el plan_id basado en la columna "Licencia"
        let planId = null;
        const licencia = row["Licencia"] ? row["Licencia"].toString().trim().toUpperCase() : null;
        switch (licencia) {
          case "ALFA":
            planId = 1;
            break;
          case "BETA":
            planId = 2;
            break;
          case "GAMMA":
            planId = 3;
            break;
          case "DELTA":
            planId = 4;
            break;
          default:
            planId = null;
        }

        // Obtener el valor de "Capital + Upgrades" para invested_amount
        const investedAmount = row["Capital + Upgrades"] ? parseFloat(row["Capital + Upgrades"]) : 0;

        // Insertar en la tabla licences
        const insertQuery = `
          INSERT INTO licences (user_id, plan_id, status, invested_amount) 
          VALUES (?, ?, ?, ?)
        `;
        const values = [userId, planId, 1, investedAmount]; // status es 1

        connection.query(insertQuery, values, (err, results) => {
          if (err) {
            console.error("Error insertando en licences:", err);
            process.exit(1); // Detener el script si ocurre un error
          } else {
            console.log("Dato insertado correctamente en licences:", results.insertId);
          }
          // Decrementar el contador de consultas pendientes
          pendingQueries--;
          if (pendingQueries === 0) {
            connection.end(); // Cerrar conexión cuando todas las inserciones hayan terminado
          }
        });
      } else {
        console.log(`Usuario no encontrado para username: ${username}`);
        pendingQueries--;
        if (pendingQueries === 0) {
          connection.end(); // Cerrar conexión cuando todas las inserciones hayan terminado
        }
      }
    });
  });
};

// Iniciar el proceso
insertDataIntoUsers();
