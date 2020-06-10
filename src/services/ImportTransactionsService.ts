import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransactionDTO {
  title: string;
  type: 'income' | 'outcome';
  category: string;
  value: number;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    // TODO

    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransactionDTO[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    // mapeando as categorias no banco a rodo :

    const categoriasExistentes = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const tituloDasCategoriasExistentes = categoriasExistentes.map(
      (category: Category) => category.title,
    );

    const titulosDasCategoriasNovas = categories
      .filter(category => !tituloDasCategoriasExistentes.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const addCategoriasNovas = categoriesRepository.create(
      titulosDasCategoriasNovas.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(addCategoriasNovas);

    const categoriasFinais = [...addCategoriasNovas, ...categoriasExistentes];

    const transaccoesCriadas = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: categoriasFinais.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(transaccoesCriadas);

    await fs.promises.unlink(filePath);

    return transaccoesCriadas;

    // console.log(categoriasFinais);

    // return { categories, transactions };
    // .filter((value, index, self) => self.indexOf(value) === index);
  }
}

export default ImportTransactionsService;
