import ora from "ora";
import cors from "cors";
import path from "path";
import express from "express";
import { Op } from "sequelize";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

import { Actions } from "./enums.js";
import { sequelize } from "./database.js";
import { Company, User, File, Perm, Process } from "./models.js";

const app = express();
const k = ora("Initializing...");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cookieParser());
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: "10mb" }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 413 && "body" in err) {
    return res.status(413).json({
      error: "PayloadTooLargeError",
      message: "O arquivo enviado é muito grande",
    });
  }
  next();
});

app.use("/", express.static(path.join(__dirname, "..", "public")));

app.post("/check-session", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) {
    return res.status(401).send();
  }

  return res.status(200).send();
});

app.post("/register", async (req, res) => {
  const { email, password, master } = req.body;

  try {
    const newUser = await User.create({
      email: email,
      password: password,
      master: master,
    });

    return res.status(200).json({
      message: "Usuário criado com sucesso",
      userId: newUser.id,
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        code: "EMAIL_REGISTERED",
        message: "O e-mail já está registrado",
      });
    }

    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Ocorreu um erro interno do servidor",
    });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email: email } });

    if (!user) {
      return res
        .status(404)
        .json({ code: "USER_NOT_FOUND", message: "Usuário não encontrado" });
    }

    if (user.password !== password) {
      return res
        .status(401)
        .json({ code: "INVALID_PASSWORD", message: "Senha inválida" });
    }

    return res
      .status(200)
      .cookie("userId", user.id, {
        maxAge: 86400000,
        httpOnly: true,
        sameSite: "strict",
      })
      .json({ message: "Login bem-sucedido" });
  } catch (error) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Ocorreu um erro interno do servidor",
    });
  }
});

app.post("/company-register", async (req, res) => {
  const userId = req.cookies.userId;
  const { ownerName, companyName, cpf, cnpj, country, matriz } = req.body;

  if (!ownerName || !companyName || !country) {
    return res.status(400).json({
      code: "MISSING_FIELDS",
      message:
        "Todos os campos são obrigatórios, exceto CPF e CNPJ (pelo menos um deles deve ser fornecido)",
    });
  }

  if (!cpf && !cnpj) {
    return res.status(400).json({
      code: "MISSING_FIELDS",
      message: "Você deve fornecer pelo menos um CPF ou CNPJ",
    });
  }

  try {
    const existingCPFCompany = cpf
      ? await Company.findOne({ where: { cpf: cpf } })
      : null;
    if (existingCPFCompany) {
      return res.status(409).json({
        code: "CPF_REGISTERED",
        message: "CPF já registrado para outra empresa",
      });
    }

    const existingCNPJCompany = cnpj
      ? await Company.findOne({ where: { cnpj: cnpj } })
      : null;
    if (existingCNPJCompany) {
      return res.status(409).json({
        code: "CNPJ_REGISTERED",
        message: "CNPJ já registrado para outra empresa",
      });
    }

    if (userId) {
      const user = await User.findOne({ where: { id: userId } });
      if (user && !user.master) {
        const company = await Company.findOne({ where: { executor: user.id } });
        if (company) {
          return res.status(403).json({
            code: "REQUEST_BLOCKED_NORMAL_USER",
            message: "Usuário não tem permissão para registrar mais empresas",
          });
        }
      }
    }

    await Company.create({
      ownerName: ownerName,
      companyName: companyName,
      cpf: cpf,
      cnpj: cnpj,
      country: country,
      matriz: matriz,
      executor: userId,
    });

    return res.status(200).json({
      message: "Registro bem-sucedido",
    });
  } catch (error) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Ocorreu um erro interno do servidor",
    });
  }
});

app.get("/company-data", async (req, res) => {
  const userId = req.cookies.userId;
  const { unique } = req.query;

  if (userId) {
    const user = await User.findOne({ where: { id: userId } });
    if (user && !user.master) {
      const companyOwned = await Company.findOne({
        where: { executor: user.id },
      });
      if (!companyOwned || companyOwned.executor !== user.id) {
        return res.status(403).json({
          code: "REQUEST_BLOCKED_NORMAL_USER",
          message: "Usuário não tem permissão para acessar dados desta empresa",
        });
      }
    }

    const result = await Company.findOne({
      where: {
        [Op.or]: [{ cpf: unique }, { cnpj: unique }],
      },
    });

    if (!result) {
      return res.status(404).json({
        code: "DATA_NOT_FOUND",
        message: "Não foram encontrados dados para o CPF ou CNPJ fornecido",
      });
    }

    return res.status(200).json(result);
  } else {
    return res.status(400).json({
      code: "MISSING_UUID",
      message: "UUID do usuário não fornecido",
    });
  }
});

app.post("/upload-file", async (req, res) => {
  try {
    const { name, blob, mimeType } = req.body;

    const file = await File.create({
      name: name,
      blob: blob,
      mimeType: mimeType,
    });

    res
      .status(200)
      .send({ message: "Arquivo enviado com sucesso", fileId: file.id });
  } catch (error) {
    res.status(500).send({ message: "Erro ao carregar o arquivo" });
  }
});

app.get("/file", async (req, res) => {
  try {
    const { id } = req.query;

    const file = await File.findOne({
      where: {
        id: id,
      },
    });

    res.status(200).send({ file: file });
  } catch (error) {
    res.status(500).send({ message: "Erro ao obter arquivo" });
  }
});

app.get("/stage", async (req, res) => {
  const { company, stage, option, processId } = req.query;
  const results = await Perm.findAll({
    where: {
      company: company,
      action: {
        [Op.in]: [Actions.REMOVED_FILE, Actions.UPLOADED_FILE],
      },
    },
  });

  if (results) {
    const data = [];

    for (const result of results) {
      const value = new Map();
      const permData = JSON.parse(result.data);

      if (
        permData.stageNumber === Number(stage) &&
        permData.optionType === option
      ) {
        const user = await User.findOne({
          where: {
            id: permData.triggeredUser,
          },
        });
        if (Number(stage) === 1) {
          if (result.action == Actions.UPLOADED_FILE) {
            value.set("attachedDate", result.createdAt);
            value.set("attachedBy", user.email);
            value.set("type", 1);
          } else {
            value.set("removedDate", result.createdAt);
            value.set("removedBy", user.email);
            value.set("type", 2);
          }
        } else if (
          Number(stage) !== 1 &&
          permData.processId &&
          permData.processId === processId
        ) {
          if (result.action == Actions.UPLOADED_FILE) {
            value.set("attachedDate", result.createdAt);
            value.set("attachedBy", user.email);
            value.set("type", 1);
          } else {
            value.set("removedDate", result.createdAt);
            value.set("removedBy", user.email);
            value.set("type", 2);
          }
        }

        if (value.size !== 0) {
          value.set("fileId", permData.fileId);
          data.push(Object.fromEntries(value));
        }
      }
    }

    return res.status(200).send(data);
  }
});

app.post("/sniff", async (req, res) => {
  try {
    const userId = req.cookies.userId;
    const { action, company, data } = req.body;

    data.triggeredUser = userId;

    await Perm.create({
      action: action,
      data: JSON.stringify(data),
      company: company,
    });

    res.status(200).send({ message: "sniffed" });
  } catch (error) {
    res.status(500).send({ error: error });
  }
});

app.post("/process", async (req, res) => {
  const { id, company } = req.body;

  const existingProcess = await Process.findOne({ where: { id } });
  if (existingProcess) {
    return res
      .status(400)
      .json({ message: "O Processo ID fornecido já está em uso" });
  }

  try {
    await Process.create({ id, company });
    return res.status(201).send({ message: "Registrado com sucesso" });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao criar o processo" });
  }
});

app.get("/process", async (req, res) => {
  try {
    const { company } = req.query;
    const allProcesses = await Process.findAll({
      where: {
        company: company,
      },
    });

    const processIds = allProcesses.map((process) => process.id);

    return res.status(200).json(processIds);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Erro ao obter os IDs dos processos" });
  }
});

app.get("/user", async (req, res) => {
  try {
    const userId = req.cookies.userId;

    if (userId) {
      const user = await User.findOne({
        where: {
          id: userId,
        },
      });

      if (user) return res.status(200).send(user);
    }

    res.status(404).send({message: "404"});
  } catch (error) {
    res.status(500).send({ error: error });
  }
});

const port = process.env.APP_PORT || 8080;

sequelize.sync().then(function () {
  app.listen(port, () => {
    k.succeed(`Server is running on port ${port}`);
  });
});
