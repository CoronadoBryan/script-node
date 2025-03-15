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
  connectTimeout: 20000 
});

connection.connect((err) => {
  if (err) {
    console.error("Error conectando a la base de datos:", err);
    process.exit(1); // Terminar el script
  }
  console.log("Conectado a la base de datos");
  insertDataIntoUsers(); // Iniciar el proceso después de conectar
});

// Leer archivo Excel principal excel 1 
const workbook = xlsx.readFile("C:\\Users\\PC\\Desktop\\BRYAN - CORONADO\\SCRIPT-50PLAN\\script-node\\data.xlsx");
const sheetName = "Afiliados"; // Especificar el nombre de la hoja directamente
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

// Leer el segundo archivo Excel para obtener información adicional
const workbookAdditionalData = xlsx.readFile("C:\\Users\\PC\\Desktop\\BRYAN - CORONADO\\SCRIPT-50PLAN\\script-node\\datata.csv");

const sheetNameAdditionalData = workbookAdditionalData.SheetNames[0];
const sheetAdditionalData = workbookAdditionalData.Sheets[sheetNameAdditionalData];
const additionalUserData = xlsx.utils.sheet_to_json(sheetAdditionalData);

// Crear un mapa de username a los otros campos
const userInfoMap = {};
additionalUserData.forEach((row) => {
  const username = row["username"] ? row["username"].toString().trim() : null;
  if (username) {
    // Guardar tanto en mayúsculas como en minúsculas
    const usernameUpper = username.toUpperCase();
    const usernameLower = username.toLowerCase();
    const userData = {
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
    
    // Guardar la información para ambas versiones del username
    userInfoMap[usernameUpper] = userData;
    userInfoMap[usernameLower] = userData;
  }
});

// Cuando buscas la información, intenta ambas versiones
const getUserInfo = (username) => {
  if (!username) return {};
  return userInfoMap[username.toUpperCase()] || 
         userInfoMap[username.toLowerCase()] || 
         {};
};

// Reiniciar el contador de AUTO_INCREMENT
const resetAutoIncrement = (tableName) => {
  const query = `ALTER TABLE ${tableName} AUTO_INCREMENT = 1`;
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
  resetAutoIncrement('users');

  let pendingQueries = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length;

  data.forEach((row) => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status !== "VALIDADO") {
      return;
    }

    status = 1; // Asignar 1 para "VALIDADO"

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    // Obtener información del mapa
    const userInfo = getUserInfo(username);
    const email = userInfo.email || null;
    const phone = row["TELEFONO"] ? row["TELEFONO"].toString().trim() : null;
    const country = userInfo.country || null;
    const fname = userInfo.fname || null;
    const lname = userInfo.lname || null;
    const password = userInfo.password || null;
    const verification_code = userInfo.verification_code || null;
    
    // Siempre establecer ev y kyc en 1 para usuarios VALIDADOS
    const ev = 1;
    const kyc = 1;
    
    const kyc_infos = userInfo.kyc_infos || null;
    const payment_method = userInfo.payment_method || null;
    const account_wallet = userInfo.account_wallet || null;

    // Obtener balance
    let balance = null;
    if (row["TOTAL MAYORES Y MENORES A 1000"]) {
      const balanceValue = parseFloat(row["TOTAL MAYORES Y MENORES A 1000"]);
      balance = !isNaN(balanceValue) ? balanceValue : null;
    }

    const balance_disponible = 0;

    const createdAt = new Date();
    const updatedAt = new Date();

    console.log(`Insertando/actualizando usuario: ${username}, balance: ${balance}`);

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
        return; // Continuar con el siguiente usuario en caso de error
      } else {
        console.log("Dato insertado o actualizado correctamente");
      }
      pendingQueries--;
      console.log(`Quedan ${pendingQueries} consultas pendientes.`); // Mensaje de depuración
      if (pendingQueries === 0) {
        console.log("Todas las consultas de usuarios han sido procesadas.");
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
  }).length;

  data.forEach((row) => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status !== "VALIDADO") {
      return;
    }

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    const codigoReferido = row["CODIGO REFERIDO2"]
      ? row["CODIGO REFERIDO2"].toString().trim()
      : null;

    if (codigoReferido) {
      const query = `SELECT id FROM users WHERE username = ? OR username = ?`;
      connection.query(query, [codigoReferido.toUpperCase(), codigoReferido.toLowerCase()], (err, results) => {
        if (err) {
          console.error("Error buscando usuario referido:", err);
          return;
        } else if (results.length > 0) {
          completeUpdate(results[0].id, username);
        } else {
          console.log(`No se encontró referido para: ${codigoReferido}`);
          completeUpdate(null, username);
        }
      });
    } else {
      completeUpdate(null, username);
    }

    function completeUpdate(referredBy, username) {
      const updateQuery = `
        UPDATE users SET reffered_by = ? WHERE username = ?
      `;
      const values = [referredBy, username];

      connection.query(updateQuery, values, (err, results) => {
        if (err) {
          console.error("Error actualizando reffered_by:", err);
          return; // Continuar con el siguiente usuario en caso de error
        } else {
          console.log("reffered_by actualizado correctamente para:", username);
        }
        pendingUpdates--;
        if (pendingUpdates === 0) {
          console.log("Actualización de reffered_by completada.");
          insertCurrentYields(); // Llamar a la función para insertar en current_yields después de actualizar reffered_by
        }
      });
    }
  });
};

// Insertar datos en MySQL en la tabla licences
const insertDataIntoLicences = () => {
  resetAutoIncrement('licences');

  let pendingQueries = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length;

  data.forEach((row) => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status !== "VALIDADO") {
      return;
    }

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    // Obtener el balance para usarlo como invested_amount
    let invested_amount = null;
    if (row["TOTAL MAYORES Y MENORES A 1000"]) {
      const balanceValue = parseFloat(row["TOTAL MAYORES Y MENORES A 1000"]);
      invested_amount = !isNaN(balanceValue) ? balanceValue : null;
    }

    // Determinar el plan_id basado en el invested_amount
    let planId = null;
    if (invested_amount !== null) {
      if (invested_amount >= 100 && invested_amount <= 1999) {
        planId = 1;  // ALFA
      } else if (invested_amount >= 2000 && invested_amount <= 3999) {
        planId = 2;  // BETA
      } else if (invested_amount >= 4000 && invested_amount <= 5999) {
        planId = 3;  // GAMMA
      } else if (invested_amount >= 6000) {
        planId = 4;  // DELTA
      }
    }

    const userQuery = `SELECT id FROM users WHERE username = ?`;
    connection.query(userQuery, [username], (err, results) => {
      if (err) {
        console.error("Error buscando usuario:", err);
        process.exit(1);
      } else if (results.length > 0) {
        const userId = results[0].id;

        const insertQuery = `
          INSERT INTO licences (
            user_id, 
            plan_id, 
            status, 
            invested_amount,
            interest_pay,
            comission_pay,
            created_at,
            updated_at
          ) 
          VALUES (?, ?, ?, ?, 1, 1, NOW(), NOW())
        `;
        const values = [userId, planId, 1, invested_amount];

        connection.query(insertQuery, values, (err, results) => {
          if (err) {
            console.error("Error insertando en licences:", err);
            process.exit(1);
          } else {
            console.log(`Licencia insertada para ${username} - Amount: ${invested_amount} - Plan: ${planId}`);
          }
          pendingQueries--;
          if (pendingQueries === 0) {
            updateUserRoles(); // En lugar de connection.end()
          }
        });
      } else {
        console.log(`Usuario no encontrado para username: ${username}`);
        pendingQueries--;
        if (pendingQueries === 0) {
          updateUserRoles(); // En lugar de connection.end()
        }
      }
    });
  });
};

// Función para validar fechas
const isValidDate = (date) => {
  return date instanceof Date && !isNaN(date);
};

// Función para validar y formatear fechas
const formatDate = (date) => {
  if (date instanceof Date && !isNaN(date)) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
};

// Función para convertir un número de serie de Excel a una fecha
const excelDateToJSDate = (serial) => {
  const date = new Date((serial - 25569) * 86400 * 1000);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
};

// Actualizar roles de los usuarios
const updateUserRoles = () => {
  // Primero obtenemos todos los usuarios VALIDADOS
  const query = `
    SELECT 
      u.id,
      u.username,
      u.balance,
      (
        SELECT COUNT(*) 
        FROM users ref 
        WHERE ref.reffered_by = u.id 
        AND ref.status = 1
      ) as referral_count,
      (
        SELECT COALESCE(SUM(balance), 0)
        FROM users ref
        WHERE ref.reffered_by = u.id
        AND ref.status = 1
      ) as referrals_volume
    FROM users u
    WHERE u.status = 1
  `;

  connection.query(query, (err, users) => {
    if (err) {
      console.error("Error obteniendo datos de usuarios:", err);
      process.exit(1);
    }

    let pendingUpdates = users.length;

    users.forEach(user => {
      let newRoleId;
      const referralCount = user.referral_count;
      const balance = user.balance;
      const referralsVolume = user.referrals_volume;

      // Determinar el rol basado en las condiciones
      if (referralCount >= 6) {
        // Potencial Líder Gamma o Delta
        if (balance >= 6000 && referralsVolume >= 24000) {
          newRoleId = 4; // Líder Delta
        } else if (balance >= 4000 && referralsVolume >= 24000) {
          newRoleId = 3; // Líder Gamma
        } else if (balance >= 100) {
          newRoleId = 2; // Promotor (si no califica para líder)
        } else {
          newRoleId = 1; // Inversor (si no tiene balance suficiente)
        }
      } else if (referralCount >= 1 && referralCount <= 5 && balance >= 100) {
        newRoleId = 2; // Promotor
      } else if (referralCount === 0 && balance >= 100) {
        newRoleId = 1; // Inversor
      } else {
        newRoleId = 1; // Por defecto Inversor
      }

      // Actualizar el rol y total_referrals del usuario
      const updateQuery = `
        UPDATE users 
        SET user_role_id = ?,
            total_referrals = ?
        WHERE id = ?
      `;

      connection.query(updateQuery, [newRoleId, referralCount, user.id], (updateErr, result) => {
        if (updateErr) {
          console.error(`Error actualizando rol para usuario ${user.username}:`, updateErr);
          process.exit(1);
        }

        console.log(`Usuario ${user.username}: Rol=${newRoleId} (${getRoleName(newRoleId)}) - Total Referidos=${referralCount} - Balance=${balance} - Volumen=${referralsVolume}`);

        pendingUpdates--;
        if (pendingUpdates === 0) {
          console.log("Actualización de roles y total de referidos completada");
          insertTransactions(); // Llamar a la función para insertar transacciones
        }
      });
    });
  });
};

// Función auxiliar para obtener el nombre del rol
const getRoleName = (roleId) => {
  switch (roleId) {
    case 1: return "Inversor";
    case 2: return "Promotor";
    case 3: return "Líder Gamma";
    case 4: return "Líder Delta";
    default: return "Desconocido";
  }
};

// Insertar transacciones en la tabla transactions
const insertTransactions = () => {
  let pendingTransactions = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length;

  // Ordenar los datos por la fecha más antigua a la más nueva
  data.sort((a, b) => {
    const fechaA = new Date(a["Fecha Upgrade1"]);
    const fechaB = new Date(b["Fecha Upgrade1"]);
    return fechaA - fechaB;
  });

  // Reiniciar el AUTO_INCREMENT de la tabla transactions
  const resetAutoIncrementTransactions = () => {
    const query = `ALTER TABLE transactions AUTO_INCREMENT = 1`;
    connection.query(query, (err, results) => {
      if (err) {
        console.error("Error reiniciando AUTO_INCREMENT en transactions:", err);
      } else {
        console.log("AUTO_INCREMENT reiniciado correctamente en transactions");
      }
    });
  };

  resetAutoIncrementTransactions();

  data.forEach((row, index) => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status !== "VALIDADO") {
      return;
    }

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    console.log(`Procesando usuario ${index + 1}/${data.length}: ${username}`);

    const userQuery = `SELECT id FROM users WHERE username = ?`;
    connection.query(userQuery, [username], (err, results) => {
      if (err) {
        console.error("Error buscando usuario:", err);
        process.exit(1);
      } else if (results.length > 0) {
        const userId = results[0].id;

        for (let i = 1; i <= 10; i++) {
          const movimientoKey = `MOVIMIENTO ${i} USDT`;
          const fechaUpgradeKey = `Fecha Upgrade${i}`;

          const movimiento = row[movimientoKey] ? parseFloat(row[movimientoKey]) : null;
          const fechaUpgrade = row[fechaUpgradeKey] ? parseFloat(row[fechaUpgradeKey]) : null;

          if (movimiento !== null && fechaUpgrade !== null) {
            const codRel = movimiento < 0 ? "RETIRO" : "ACTUALIZO";
            const details = movimiento < 0 ? `retiro (${movimiento})` : `actualizo (${movimiento})`;

            const validFechaUpgrade = excelDateToJSDate(fechaUpgrade).toISOString().slice(0, 19).replace('T', ' ');

            const insertQuery = `
              INSERT INTO transactions (user_id, username, details, cod_rel, category, admin_id, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 11, NULL, NULL, ?, NOW())
            `;
            const values = [userId, username, details, codRel, validFechaUpgrade];

            connection.query(insertQuery, values, (err, results) => {
              if (err) {
                console.error("Error insertando transacción:", err);
                process.exit(1);
              } else {
                console.log(`Transacción insertada para ${username} - Monto: ${movimiento} - Tipo: ${codRel}`);
              }
              pendingTransactions--;
              if (pendingTransactions === 0) {
                console.log("Todas las transacciones han sido insertadas.");
                connection.end(); // Cerrar la conexión después de completar
              }
            });
          }
        }
      } else {
        console.log(`Usuario no encontrado para username: ${username}`);
        pendingTransactions--;
        if (pendingTransactions === 0) {
          console.log("Todas las transacciones han sido insertadas.");
          connection.end(); // Cerrar la conexión después de completar
        }
      }
    });
  });

  // Llamar a la función para insertar transacciones de afiliación
  insertAffiliationTransactions();

  // Llamar a la función para encontrar usuarios sin afiliación
  findUsersWithoutAffiliation();
};

// Insertar transacciones de afiliación en la tabla transactions
const insertAffiliationTransactions = () => {
  let pendingAffiliations = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  }).length;

  data.forEach((row) => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    if (status !== "VALIDADO") {
      return;
    }

    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    const userQuery = `SELECT id FROM users WHERE username = ?`;
    connection.query(userQuery, [username], (err, results) => {
      if (err) {
        console.error("Error buscando usuario:", err);
        process.exit(1);
      } else if (results.length > 0) {
        const userId = results[0].id;

        const inversionUSDT = row["Inversión en USDT"] !== undefined ? parseFloat(row["Inversión en USDT"]) : null;
        const fechaEfectivaAfiliacion = row["Fecha Efectiva Afiliacion"] ? parseFloat(row["Fecha Efectiva Afiliacion"]) : null;

        // Manejar casos donde los valores son null
        const details = inversionUSDT !== null ? `Se afilio con (${inversionUSDT})` : 'Se afilio con (null)';
        const validFechaAfiliacion = fechaEfectivaAfiliacion !== null ? excelDateToJSDate(fechaEfectivaAfiliacion).toISOString().slice(0, 19).replace('T', ' ') : null;

        const insertQuery = `
          INSERT INTO transactions (user_id, username, details, cod_rel, category, admin_id, status, created_at, updated_at)
          VALUES (?, ?, ?, 'AFILIACION', 11, NULL, NULL, ?, NOW())
        `;
        const values = [userId, username, details, validFechaAfiliacion];

        connection.query(insertQuery, values, (err, results) => {
          if (err) {
            console.error("Error insertando transacción de afiliación:", err);
            process.exit(1);
          } else {
            console.log(`Transacción de afiliación insertada para ${username} - Monto: ${inversionUSDT}`);
          }
          pendingAffiliations--;
          if (pendingAffiliations === 0) {
            console.log("Todas las transacciones de afiliación han sido insertadas.");
            // Aquí puedes llamar a otra función si es necesario
          }
        });
      } else {
        console.log(`Usuario no encontrado para username: ${username}`);
        pendingAffiliations--;
        if (pendingAffiliations === 0) {
          console.log("Todas las transacciones de afiliación han sido insertadas.");
          // Aquí puedes llamar a otra función si es necesario
        }
      }
    });
  });
};

// Consulta para identificar usuarios sin afiliación
const findUsersWithoutAffiliation = () => {
  const query = `
    SELECT u.username
    FROM users u
    LEFT JOIN transactions t ON u.id = t.user_id AND t.cod_rel = 'AFILIACION'
    WHERE t.id IS NULL
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error buscando usuarios sin afiliación:", err);
    } else {
      console.log("Usuarios sin afiliación:", results);
    }
    connection.end(); // Cerrar la conexión después de completar
  });
};

// Insertar pagos en la tabla current_yields
const insertCurrentYields = () => {
  console.log("Iniciando inserción de yields...");

  // Reiniciar el AUTO_INCREMENT antes de insertar
  resetAutoIncrement('current_yields');

  const validData = data.filter(row => {
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;
    return status === "VALIDADO";
  });

  let pendingInserts = 0;

  validData.forEach((row) => {
    const username = row["COD. PLATAFORMA"]
      ? row["COD. PLATAFORMA"].toString().trim()
      : null;

    if (!username) {
      console.error("Error: Username no válido o no encontrado.");
      process.exit(1); // Terminar el script
    }

    console.log(`Procesando usuario: ${username}`);

    const userQuery = `SELECT id FROM users WHERE username = ?`;
    connection.query(userQuery, [username], (err, results) => {
      if (err) {
        console.error("Error buscando usuario:", err);
        process.exit(1); // Terminar el script
      } else if (results.length === 0) {
        console.error(`Usuario no encontrado para username: ${username}`);
        process.exit(1); // Terminar el script
      }

      const userId = results[0].id;

      // Procesar pagos semanales y mensuales
      Object.keys(row).forEach((key) => {
        if (key.startsWith("Pagos Semanales") || key.startsWith("Pago Mensual")) {
          let amountString = row[key];

          // Asegúrate de que amountString sea una cadena
          if (typeof amountString !== 'string') {
            amountString = String(amountString);
          }

          const amount = parseFloat(amountString.replace(/[^0-9.-]+/g, '').replace(',', '.'));

          // Solo procesar si el monto es mayor que cero
          if (!isNaN(amount) && amount > 0) {
            console.log(`Insertando ${key} para ${username} - Monto: ${amount}`);
            pendingInserts++;

            // Lógica de inserción en la base de datos
            const insertQuery = `
              INSERT INTO current_yields (user_id, username, details, amount, created_at)
              VALUES (?, ?, ?, ?, NOW())
            `;
            connection.query(insertQuery, [userId, username, key, amount], (err, result) => {
              if (err) {
                console.error("Error al insertar en la base de datos:", err);
              } else {
                console.log(`Pago insertado correctamente para ${username}: ${key} - Monto: ${amount}`);
              }

              pendingInserts--;
              if (pendingInserts === 0) {
                console.log("Todas las inserciones de pagos han sido completadas.");
              }
            });
          }
        }
      });
    });
  });
};

const parseDate = (dateString) => {
  // Intenta convertir la fecha usando un formato específico
  const parts = dateString.split('/');
  if (parts.length === 3) {
    // Asumiendo formato DD/MM/YYYY
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return null; // Retorna null si no se puede convertir
};
