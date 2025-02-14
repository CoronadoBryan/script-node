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

// Leer archivo Excel
const workbook = xlsx.readFile(
  "C:\\Users\\coron\\Desktop\\script-node\\datata.xlsx"
);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

// Reiniciar el contador de IDs
const resetAutoIncrement = () => {
  const query = `ALTER TABLE users AUTO_INCREMENT = 1`;
  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error reiniciando AUTO_INCREMENT:", err);
    } else {
      console.log("AUTO_INCREMENT reiniciado correctamente");
      insertData();
    }
  });
};

// Insertar datos en MySQL
const insertData = () => {
  data.forEach((row) => {
    const username = row["CODIGO AFILIADO"]
      ? row["CODIGO AFILIADO"].toString().trim()
      : null;
    const email = row["EMAIL"] ? row["EMAIL"].toString().trim() : null;
    const phone = row["TELEFONO"] ? row["TELEFONO"].toString().trim() : null;
    const country = row["PAIS"] ? row["PAIS"].toString().trim() : null;
    let status = row["ESTADO"]
      ? row["ESTADO"].toString().trim().toUpperCase()
      : null;

    // Validar status
    status = status === "VALIDADO" ? 1 : 0;

    const query = `INSERT INTO users (username, email, phone, country, status) VALUES (?, ?, ?, ?, ?)`;
    const values = [username, email, phone, country, status];

    connection.query(query, values, (err, results) => {
      if (err) {
        console.error("Error insertando datos:", err);
      } else {
        console.log("Dato insertado correctamente:", results.insertId);
      }
    });
  });

  // Cerrar conexión después de la inserción
  connection.end();
};

resetAutoIncrement();
