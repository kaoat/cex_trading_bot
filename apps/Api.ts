import CryptoJS from "crypto-js";
import qs from "qs";
import { IConfig, IRequest } from "./Interfaces";
import axios, { AxiosRequestHeaders, AxiosResponse } from "axios";

type httpVerb = "GET" | "POST" | "PUT" | "DELETE";

class Api {
  private conf: IConfig;
  private time: number;
  private timestamp: number;
  private nonce: string;
  constructor(input: IConfig) {
    this.conf = input;
    this.time = 0;
    this.nonce = "";
    this.timestamp = 0;
  }

  private async getTime() {
    await axios
      .get(this.conf.apiHost + "/api/v2/time")
      .then((res: AxiosResponse) => {
        this.conf.localTimeDiff = res.data.serverTime - +new Date();
        this.time = res.data.serverTime;
      });
  }
  private createNonce(): string {
    var s: string = "";
    var length: number = 32;
    do {
      s += Math.random().toString(36).substr(2);
    } while (s.length < length);
    s = s.substr(0, length);
    return s;
  }

  private getAuthHeader(
    apiKey: string,
    apiSecret: string,
    time: number,
    nonce: string,
    organizationId: string,
    request: IRequest
  ) {
    const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, apiSecret);

    hmac.update(apiKey);
    hmac.update("\0");
    hmac.update(time.toString());
    hmac.update("\0");
    hmac.update(nonce);
    hmac.update("\0");
    hmac.update("\0");
    if (organizationId) hmac.update(organizationId);
    hmac.update("\0");
    hmac.update("\0");
    hmac.update(request.method);
    hmac.update("\0");
    hmac.update(request.path);
    hmac.update("\0");
    if (request.query)
      hmac.update(
        typeof request.query == "object"
          ? qs.stringify(request.query)
          : request.query
      );
    if (request.body) {
      hmac.update("\0");
      hmac.update(
        typeof request.body == "object"
          ? JSON.stringify(request.body)
          : request.body
      );
    }

    return apiKey + ":" + hmac.finalize().toString(CryptoJS.enc.Hex);
  }

  private async apiCall(
    method: httpVerb,
    path: string,
    { query, body }: any = {}
  ) {
    let tempMethod: httpVerb = method;
    await this.getTime();
    if (this.conf.localTimeDiff === null) {
      return Promise.reject(new Error("Get server time first .getTime()"));
    }

    // query in path
    var [pathOnly, pathQuery] = path.split("?");
    if (pathQuery) query = { ...qs.parse(pathQuery), ...query };

    this.nonce = this.createNonce();

    this.timestamp = this.time || +new Date() + this.conf.localTimeDiff;

    let customHeader: AxiosRequestHeaders = {
      "X-Request-Id": this.nonce,
      "X-User-Agent":
        "name=Brave;version=96.0.4664.110;buildNumber=1;os=Windows;osVersion=10;deviceVersion=amd64;lang=en",
      "X-Time": this.timestamp.toString(),
      "X-Nonce": this.nonce,
      "X-User-Lang": this.conf.locale,
      "X-Organization-Id": this.conf.orgId,
      "X-Auth": this.getAuthHeader(
        this.conf.apiKey,
        this.conf.apiSecret,
        this.timestamp,
        this.nonce,
        this.conf.orgId,
        {
          method,
          path: pathOnly,
          query,
          body,
        }
      ),
    };
    return axios({
      method: tempMethod,
      url: this.conf.apiHost + pathOnly,
      params: query,
      data: body,
      headers: customHeader,
    });
  }

  get(path: string, options: any) {
    return this.apiCall("GET", path, options);
  }

  post(path: string, options: any) {
    return this.apiCall("POST", path, options);
  }

  put(path: string, options: any) {
    return this.apiCall("PUT", path, options);
  }

  delete(path: string, options: any) {
    return this.apiCall("DELETE", path, options);
  }
}

export default Api;
