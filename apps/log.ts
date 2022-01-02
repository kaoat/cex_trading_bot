import * as fs from "fs";
import * as path from "path";

async function writeToFile(fileName: string, message: string) {
  var dirname = path.dirname(fileName);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname);
  }
  fs.writeFile(dirname, message, (err) => {
    if (err) console.log(err);
    else {
      console.log("File written successfully\n");
    }
  });
}

export { writeToFile };
