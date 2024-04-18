const userId = localStorage.getItem("userId");

// Mapeia os valores dos estados para suas siglas correspondentes
const estadosSiglas = {
  "": "", // Adicione a sigla padrão para quando nenhum estado for selecionado
  12: "AC",
  27: "AL",
  13: "AM",
  16: "AP",
  29: "BA",
  23: "CE",
  53: "DF",
  32: "ES",
  52: "GO",
  21: "MA",
  31: "MG",
  50: "MS",
  51: "MT",
  15: "PA",
  25: "PB",
  26: "PE",
  22: "PI",
  41: "PR",
  33: "RJ",
  24: "RN",
  11: "RO",
  14: "RR",
  43: "RS",
  42: "SC",
  28: "SE",
  35: "SP",
  17: "TO",
};

document
  .getElementById("cadastro-orion-global")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    const nome = getElementVal("nome");
    const empresa = getElementVal("empresa");
    const cpf = getElementVal("cpf");
    const cnpj = getElementVal("cnpj");
    const matriz = document.querySelector("#matriz").checked;
    const estado = estadosSiglas[getElementVal("CodUf")];

    fetch("http://localhost:8080/company-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerName: nome,
        companyName: empresa,
        cpf: cpf,
        cnpj: cnpj,
        country: estado,
        matriz: matriz,
        userId: userId,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          let alertMsg = document.querySelector(".alert");
          alertMsg.innerHTML = data.message;
          alertMsg.style.display = "block";
          await delay(2000)
        } else {
          document.getElementById("cadastro-orion-global").reset();

          let msg = document.getElementById("mensagem-sucesso");
          msg.innerText = data.message;
          msg.style.display = "block";
          await delay(2000)
          window.location.href = "CPF.html";
        }
      })
      .catch((error) => alert(error));
  });

const getElementVal = (id) => {
  return document.getElementById(id).value;
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

window.onload = function () {
  if (!userId) {
    window.location.href = "/";
  }
};
