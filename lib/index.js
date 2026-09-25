// src/shared.ts
var PACKAGE_NAME = "dsh-llm-retry-settings";
var ENTRY_ID = "llm-retry-settings";
var PRODUCER_ID = "dsh-llm-retry";
var STATS_PATH = "/api/dsh-llm-retry-settings/stats";
var LOG_PATH = "/api/dsh-llm-retry-settings/log";
var OVERRIDE_INHERIT = -1;
var OVERRIDE_MAX_ROWS = 20;
var DEFAULT_RETRYABLE_CODES = ["INVALID_REQUEST", "PI_AI_ERROR"];
var DEFAULT_CONTINUATION_PROMPT = "\u4E0A\u4E00\u6761\u56DE\u590D\u56E0\u8FBE\u5230\u8F93\u51FA token \u4E0A\u9650\u88AB\u622A\u65AD\u3002\u8BF7\u4ECE\u4E2D\u65AD\u5904\u76F4\u63A5\u7EE7\u7EED\u8F93\u51FA\uFF0C\u4E0D\u8981\u91CD\u590D\u5DF2\u7ECF\u8F93\u51FA\u7684\u5185\u5BB9\uFF0C\u4E5F\u4E0D\u8981\u91CD\u65B0\u5F00\u5934\u3002";
var DEFAULTS = {
  enabled: false,
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 1e4,
  jitterRatio: 0.1,
  retryableCodes: [...DEFAULT_RETRYABLE_CODES],
  autoContinue: false,
  maxContinuations: 2,
  continuationPrompt: "",
  /** 瞬时错误 (重试彻底失败) 也自动续写一轮; 默认关闭. */
  continueOnError: false,
  /** provider/model 级策略覆盖; 空数组 = 全部沿用全局值. */
  overrides: []
};

// src/host/auto-continue.ts
import { randomUUID } from "node:crypto";

// src/host/diag.ts
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";

// src/host/config.ts
import { homedir } from "node:os";
import { join } from "node:path";

// node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.5/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/.pnpm/@deepseek-ai+schemastery@3.18.4/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = /* @__PURE__ */ Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/host/config.ts
var LOG_DIR = (() => {
  const home = process.env["DSH_HOME"] && process.env["DSH_HOME"].trim() !== "" ? process.env["DSH_HOME"].trim() : join(homedir(), ".dsh");
  return join(home, "logs", "dsh-llm-retry-settings");
})();
var LOG_FILE = join(LOG_DIR, "host.log");
var Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULTS.enabled).volatile(),
  maxRetries: Schema.number().step(1).min(0).default(DEFAULTS.maxRetries).volatile(),
  initialDelayMs: Schema.number().min(1).default(DEFAULTS.initialDelayMs).volatile(),
  maxDelayMs: Schema.number().min(1).default(DEFAULTS.maxDelayMs).volatile(),
  jitterRatio: Schema.number().min(0).max(1).default(DEFAULTS.jitterRatio).volatile(),
  retryableCodes: Schema.array(Schema.string()).default([...DEFAULTS.retryableCodes]).volatile(),
  autoContinue: Schema.boolean().default(DEFAULTS.autoContinue).volatile(),
  maxContinuations: Schema.number().step(1).min(0).default(DEFAULTS.maxContinuations).volatile(),
  continuationPrompt: Schema.string().default(DEFAULTS.continuationPrompt).volatile(),
  continueOnError: Schema.boolean().default(DEFAULTS.continueOnError).volatile(),
  overrides: Schema.array(
    Schema.object({
      provider: Schema.string().default("*"),
      model: Schema.string().default("*"),
      maxRetries: Schema.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
      initialDelayMs: Schema.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
      maxDelayMs: Schema.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
      jitterRatio: Schema.number().min(OVERRIDE_INHERIT).max(1).default(OVERRIDE_INHERIT)
    })
  ).default([]).volatile(),
  logPath: Schema.string().default(LOG_FILE).volatile()
});
var VOLATILE_WRITE = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function unvol(value) {
  if (value !== null && typeof value === "object" && VOLATILE_WRITE in value) {
    const get = value.get;
    if (typeof get === "function") return get();
  }
  return value;
}
var normCodes = (value) => Array.isArray(value) ? value.filter((code) => typeof code === "string" && code.length > 0) : [];
var asBool = (value) => {
  const raw = unvol(value);
  return typeof raw === "boolean" ? raw : void 0;
};
var asInt = (value, min) => {
  const raw = unvol(value);
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(min, Math.floor(raw)) : void 0;
};
var asFloat = (value, min, max) => {
  const raw = unvol(value);
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : void 0;
};
function normOverrides(raw, fallback) {
  if (!Array.isArray(raw)) return fallback.map((row) => ({ ...row }));
  const rows = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const row = item;
    const provider = typeof row.provider === "string" ? row.provider.trim() : "";
    const model = typeof row.model === "string" ? row.model.trim() : "";
    if (provider === "" && model === "") continue;
    rows.push({
      provider: provider === "" ? "*" : provider,
      model: model === "" ? "*" : model,
      maxRetries: asInt(row.maxRetries, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      initialDelayMs: asInt(row.initialDelayMs, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      maxDelayMs: asInt(row.maxDelayMs, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      jitterRatio: asFloat(row.jitterRatio, OVERRIDE_INHERIT, 1) ?? OVERRIDE_INHERIT
    });
  }
  return rows.slice(0, OVERRIDE_MAX_ROWS);
}
var DEFAULTS_CONFIG = { ...DEFAULTS, logPath: LOG_FILE };
function coerceConfig(raw, fallback) {
  const codes = unvol(raw?.retryableCodes);
  const prompt = unvol(raw?.continuationPrompt);
  const overrides = unvol(raw?.overrides);
  const logPath = unvol(raw?.logPath);
  const config = {
    enabled: asBool(raw?.enabled) ?? fallback.enabled,
    maxRetries: asInt(raw?.maxRetries, 0) ?? fallback.maxRetries,
    initialDelayMs: asInt(raw?.initialDelayMs, 1) ?? fallback.initialDelayMs,
    maxDelayMs: asInt(raw?.maxDelayMs, 1) ?? fallback.maxDelayMs,
    jitterRatio: asFloat(raw?.jitterRatio, 0, 1) ?? fallback.jitterRatio,
    retryableCodes: Array.isArray(codes) ? normCodes(codes) : [...fallback.retryableCodes],
    autoContinue: asBool(raw?.autoContinue) ?? fallback.autoContinue,
    maxContinuations: asInt(raw?.maxContinuations, 0) ?? fallback.maxContinuations,
    continuationPrompt: typeof prompt === "string" ? prompt : fallback.continuationPrompt,
    continueOnError: asBool(raw?.continueOnError) ?? fallback.continueOnError,
    overrides: normOverrides(overrides, fallback.overrides),
    logPath: typeof logPath === "string" && logPath !== "" ? logPath : fallback.logPath
  };
  if (config.initialDelayMs > config.maxDelayMs) config.initialDelayMs = config.maxDelayMs;
  return config;
}
function normalizeConfig(raw) {
  return coerceConfig(raw, DEFAULTS_CONFIG);
}

// src/host/diag.ts
var DIAG_TAG = "v0.2.0";
var DIAG_MAX_BYTES = 256 * 1024;
var DIAG_DEDUPE_MS = 5e3;
var diagBytes = -1;
var diagLastMessage = "";
var diagLastAt = 0;
var diagSuppressed = 0;
var diagActive = true;
var diagDropped = 0;
function setDiagActive(active) {
  if (active === diagActive) return;
  diagActive = active;
  if (active && diagDropped > 0) {
    const dropped = diagDropped;
    diagDropped = 0;
    diagLastMessage = "";
    diag(`\uFF08\u529F\u80FD\u91CD\u65B0\u5F00\u542F\uFF1A\u6B64\u524D\u5173\u95ED\u671F\u95F4\u7701\u7565\u4E86 ${dropped} \u884C\u8BCA\u65AD\uFF09`);
  }
}
function diag(message) {
  if (!diagActive) {
    diagDropped += 1;
    return;
  }
  const now = Date.now();
  if (message === diagLastMessage && now - diagLastAt < DIAG_DEDUPE_MS) {
    diagSuppressed += 1;
    return;
  }
  const note = diagSuppressed > 0 ? `\uFF08${diagSuppressed} \u6B21\u91CD\u590D\u5DF2\u7701\u7565\uFF09` : "";
  diagSuppressed = 0;
  diagLastMessage = message;
  diagLastAt = now;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${note}${message}
`;
    const bytes = Buffer.byteLength(line);
    if (diagBytes < 0) {
      try {
        diagBytes = statSync(LOG_FILE).size;
      } catch {
        diagBytes = 0;
      }
    }
    if (diagBytes > DIAG_MAX_BYTES) {
      writeFileSync(LOG_FILE, line);
      diagBytes = bytes;
      return;
    }
    appendFileSync(LOG_FILE, line);
    diagBytes += bytes;
  } catch {
  }
}
function summaryOf(config) {
  return `enabled=${config.enabled} codes=${config.retryableCodes.length} maxRetries=${config.maxRetries} backoff=${config.initialDelayMs}~${config.maxDelayMs}ms jitter=${config.jitterRatio} autoContinue=${config.autoContinue} maxContinuations=${config.maxContinuations} continueOnError=${config.continueOnError} overrides=${config.overrides.length}`;
}

// src/host/auto-continue.ts
var STATE_MAX = 200;
var TRANSIENT_CONTINUE_CODES = /* @__PURE__ */ new Set([
  "PI_AI_ERROR",
  "TRANSPORT",
  "TIMEOUT",
  "SERVER",
  "EMPTY_RESPONSE",
  "STREAM_CLOSED",
  "MALFORMED_RESPONSE",
  "INVALID_RESPONSE",
  "PI_AI_NOT_WARMED",
  "UNKNOWN"
]);
function codeOf(reason) {
  const code = reason?.error?.code ?? reason?.error?.failure?.code ?? reason?.failure?.code;
  return typeof code === "string" ? code : void 0;
}
function inboxBusy(agent) {
  const inbox = agent?.inbox;
  if (inbox === void 0 || inbox === null) return false;
  const size = (value) => Array.isArray(value) ? value.length : 0;
  return size(inbox.nextTurn) > 0 || size(inbox.nextStep) > 0;
}
function lastTurnEnd(session) {
  if (typeof session.eventAt !== "function" || typeof session.seq !== "number") return void 0;
  const end = session.seq;
  const read = (index) => {
    const event = session.eventAt?.(index);
    if (event?.type !== "turn/end") return void 0;
    const reason = event.data?.reason;
    return {
      turn: typeof event.data?.turn === "number" ? event.data.turn : -1,
      kind: typeof reason?.kind === "string" ? reason.kind : "",
      code: codeOf(reason)
    };
  };
  const near = Math.max(0, end - 24);
  for (let i = end - 1; i >= near; i -= 1) {
    const hit = read(i);
    if (hit !== void 0) return hit;
  }
  const far = Math.max(0, end - 400);
  for (let i = near - 1; i >= far; i -= 1) {
    const hit = read(i);
    if (hit !== void 0) return hit;
  }
  return void 0;
}
function makeContinuationMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: "user",
    content: Object.freeze([Object.freeze({ type: "text", text })]),
    // session 格式 v4 拒绝退役的 `kind: 'plugin'`: 第三方生产者必须写
    // `plugin:<生产者 id>`, 否则投递时抛 format v4 message requires a
    // producer-owned source kind (用户可见为 "本轮运行失败").
    source: Object.freeze({ kind: `plugin:${PRODUCER_ID}` })
  });
}
function visibleTextBeforeTurnEnd(session, turn) {
  if (typeof session.eventAt !== "function" || typeof session.seq !== "number") return true;
  const end = session.seq;
  const hasText = (content) => Array.isArray(content) && content.some((part) => part?.type === "text" && typeof part.text === "string" && part.text.trim() !== "");
  for (let i = end - 1, floor = Math.max(-1, end - 120); i > floor; i -= 1) {
    const event = session.eventAt(i);
    if (event === void 0 || typeof event.type !== "string") continue;
    if (event.type === "turn/start" && event.data?.turn === turn) return false;
    if (event.type === "assistant/message") {
      if (hasText(event.data?.message?.content ?? event.data?.content)) return true;
    }
  }
  return false;
}
var AutoContinue = class {
  /**
   * @param ctx - 插件上下文.
   * @param live - 生效配置的读取口.
   * @param models - 会话模型缓存.
   * @param observer - 观测计数.
   */
  constructor(ctx, live, models, observer) {
    this.ctx = ctx;
    this.live = live;
    this.models = models;
    this.observer = observer;
  }
  ctx;
  live;
  models;
  observer;
  states = /* @__PURE__ */ new Map();
  /** 挂上三条事件监听. */
  install() {
    this.ctx.on("session/event", (session, event) => {
      this.onSessionEvent(session, event);
    });
    this.ctx.on("agent/status", (payload) => {
      this.onAgentStatus(payload);
    });
    this.ctx.on("session/disposed", (session) => {
      if (session === void 0 || session === null) return;
      const id = String(session.id);
      this.states.delete(id);
      this.models.forget(id);
    });
  }
  /** 会话账本 (按需创建, 超出上限丢最早插入的). */
  stateOf(id) {
    let state = this.states.get(id);
    if (state === void 0) {
      state = { chain: 0, capped: false, lastTurn: -1 };
      this.states.set(id, state);
      while (this.states.size > STATE_MAX) {
        const oldest = this.states.keys().next().value;
        if (typeof oldest !== "string") break;
        this.states.delete(oldest);
      }
    }
    return state;
  }
  onSessionEvent(session, event) {
    try {
      if (session === void 0 || session === null || event === void 0 || event === null) return;
      if (typeof event.type !== "string") return;
      switch (event.type) {
        case "user/message": {
          const state = this.stateOf(String(session.id));
          const source = event.data?.source;
          const kind = source?.kind;
          if (kind === "user") {
            if (state.chain > 0) diag(`\u4EBA\u5DE5\u53D1\u8A00\uFF0C\u91CD\u7F6E\u7EED\u5199\u94FE session=${session.id} chain=${state.chain}`);
            state.chain = 0;
            state.capped = false;
            return;
          }
          if (kind === `plugin:${PRODUCER_ID}`) diag(`\u7EED\u5199\u6D88\u606F\u5DF2\u5165\u4F1A\u8BDD session=${session.id}`);
          return;
        }
        // 模型名只在请求元数据里: payload 里只有 provider, overrides 的 model 匹配全靠这里.
        case "request/context":
        case "request/header": {
          const meta = event.type === "request/context" ? event.data : event.data?.header?.config;
          const model = meta?.model;
          if (typeof model === "string" && model !== "") {
            this.models.remember(
              String(session.id),
              typeof meta?.provider === "string" ? meta.provider : "",
              model
            );
          }
          return;
        }
        case "turn/end": {
          const reason = event.data?.reason;
          if (reason === void 0 || reason === null || typeof reason.kind !== "string") return;
          this.handleTurnEnd(
            session,
            typeof event.data?.turn === "number" ? event.data.turn : -1,
            reason.kind,
            "session/event",
            void 0,
            codeOf(reason)
          );
          return;
        }
        default:
          return;
      }
    } catch (error) {
      diag(`\u81EA\u52A8\u7EED\u5199\u5904\u7406\u5F02\u5E38\uFF08session/event\uFF09\uFF1A${error instanceof Error ? `${error.message}
${error.stack ?? ""}` : String(error)}`);
      this.ctx.logger.warn("[dsh-llm-retry-settings] \u81EA\u52A8\u7EED\u5199\u5904\u7406\u5931\u8D25", error);
    }
  }
  onAgentStatus(payload) {
    try {
      if (payload === void 0 || payload === null || payload.status !== "idle") return;
      if (!this.live.current().autoContinue) return;
      const session = payload.agent?.session;
      if (session === void 0 || session === null || session.id === void 0) return;
      const end = lastTurnEnd(session);
      if (end === void 0) return;
      this.handleTurnEnd(session, end.turn, end.kind, "agent/status", payload.agent, end.code);
    } catch (error) {
      diag(`\u81EA\u52A8\u7EED\u5199\u5904\u7406\u5F02\u5E38\uFF08agent/status\uFF09\uFF1A${String(error)}`);
    }
  }
  /**
   * 一次 turn/end 的唯一处理入口, 两条触发路径共用.
   * @param session - 会话.
   * @param turn - 回合号.
   * @param kind - 结束原因类别.
   * @param via - 触发路径 (诊断用).
   * @param agentHint - 兜底路径已经拿到的 agent 实例.
   * @param errorCode - 结束原因里的错误码.
   */
  handleTurnEnd(session, turn, kind, via, agentHint, errorCode) {
    const config = this.live.current();
    const state = this.stateOf(String(session.id));
    if (state.lastTurn === turn) return;
    state.lastTurn = turn;
    const truncation = kind === "max-tokens";
    const transientFailure = kind === "error" && config.continueOnError && TRANSIENT_CONTINUE_CODES.has(errorCode ?? "");
    if (!truncation && !transientFailure) {
      state.chain = 0;
      state.capped = false;
      return;
    }
    diag(
      `turn/end via=${via} session=${session.id} turn=${turn} kind=${kind}${transientFailure ? ` code=${errorCode ?? ""}` : ""} autoContinue=${config.autoContinue} maxContinuations=${config.maxContinuations} chain=${state.chain}`
    );
    if (!config.autoContinue) return;
    if (state.chain >= config.maxContinuations) {
      if (!state.capped) {
        state.capped = true;
        this.observer.hitCap(turn);
        diag(`bail via=${via}: \u8FDE\u7EED\u7EED\u5199\u89E6\u9876\uFF08${state.chain}/${config.maxContinuations}\uFF09session=${session.id}`);
        this.ctx.logger.info(
          `[dsh-llm-retry-settings] \u4F1A\u8BDD ${String(session.id)} \u8FDE\u7EED\u7EED\u5199\u5DF2\u8FBE\u4E0A\u9650\uFF08${config.maxContinuations} \u6B21\uFF09\uFF0C\u505C\u6B62\u81EA\u52A8\u7EED\u5199`
        );
      }
      return;
    }
    let agent = agentHint;
    if (agent === void 0 || agent === null) {
      const agents = this.ctx.agents;
      if (agents === void 0 || typeof agents.get !== "function") {
        diag(`bail via=${via}: ctx.agents \u4E0D\u53EF\u7528\uFF08inject \u672A\u6EE1\u8DB3\uFF1F\uFF09`);
        return;
      }
      agent = agents.get(String(session.id));
      if (agent === void 0 || agent === null) {
        diag(`bail via=${via}: agents.get(${String(session.id)}) \u65E0\u5B9E\u4F8B`);
        return;
      }
    }
    if (agent.session?.id !== session.id) {
      diag(`bail via=${via}: agent.session.id=${String(agent.session?.id)} \u4E0E\u4E8B\u4EF6 session.id=${String(session.id)} \u4E0D\u7B26`);
      return;
    }
    if (typeof agent.followup !== "function") {
      diag(`bail via=${via}: agent.followup \u4E0D\u662F\u51FD\u6570\uFF08type=${typeof agent.followup}\uFF09`);
      return;
    }
    if (inboxBusy(agent)) {
      this.observer.skippedByUser(turn);
      diag(`bail via=${via}: inbox \u5DF2\u6709\u5F85\u5904\u7406\u6D88\u606F\uFF0C\u8DF3\u8FC7\u81EA\u52A8\u7EED\u5199 session=${String(session.id)}`);
      return;
    }
    const hasVisibleText = visibleTextBeforeTurnEnd(session, turn);
    state.chain += 1;
    const expectedChain = state.chain;
    const sessionId = String(session.id);
    const attempt = (round) => {
      void (async () => {
        try {
          if (typeof agent.whenIdle === "function") await agent.whenIdle();
          else await new Promise((resolve2) => setTimeout(resolve2, 0));
          if (state.lastTurn !== turn || state.chain !== expectedChain || !this.states.has(sessionId)) {
            diag(`\u653E\u5F03\u6295\u9012 round=${round} via=${via} session=${sessionId} turn=${turn} lastTurn=${state.lastTurn} chain=${state.chain}`);
            return;
          }
          if (inboxBusy(agent)) {
            this.observer.skippedByUser(turn);
            diag(`\u653E\u5F03\u6295\u9012 round=${round} via=${via} session=${sessionId}\uFF1A\u7B49\u5F85\u671F\u95F4 inbox \u5DF2\u6709\u65B0\u6D88\u606F`);
            return;
          }
          const fresh = this.live.current();
          const custom = fresh.continuationPrompt.trim();
          const prompt = custom === "" ? DEFAULT_CONTINUATION_PROMPT : custom;
          agent.followup(makeContinuationMessage(prompt));
          const known = this.models.of(sessionId);
          this.observer.continued({ turn, provider: known?.provider, model: known?.model });
          diag(
            `\u7EED\u5199\u5DF2\u6295\u9012 round=${round} via=${via} session=${sessionId} turn=${turn} prompt=${custom === "" ? "default" : "custom"} text=${hasVisibleText ? "yes" : "no"} chain=${state.chain}/${fresh.maxContinuations}`
          );
        } catch (error) {
          diag(`\u7EED\u5199\u6295\u9012\u5931\u8D25 round=${round} via=${via} session=${sessionId} turn=${turn}\uFF1A${String(error)}`);
          if (round === 1 && String(error).includes("reenter")) setTimeout(() => {
            attempt(2);
          }, 0);
        }
      })();
    };
    attempt(1);
  }
};

// src/host/live-config.ts
var LiveConfig = class {
  live;
  /** settings scope 句柄; 服务未就绪时为 undefined. */
  scope;
  /** 上一次收敛过的原始引用: 引用没变就跳过整表收敛. */
  lastRaw = null;
  /**
   * @param config - 插件激活时 Loader 解析出的 Config.
   */
  constructor(config) {
    this.live = normalizeConfig(config);
    setDiagActive(this.live.enabled || this.live.autoContinue);
  }
  /** 最近一次同步后的值 (不触发重读). */
  get value() {
    return this.live;
  }
  /** 事件/请求时刻的有效配置: 优先直接问 settings, 失败退回 live 快照. */
  current() {
    const scope = this.scope;
    if (scope !== void 0) {
      try {
        const raw = scope.get();
        if (raw !== this.lastRaw) this.sync(raw);
      } catch (error) {
        diag(`scope.get \u5931\u8D25\uFF0C\u6CBF\u7528 live\uFF1A${String(error)}`);
      }
    }
    return this.live;
  }
  /** 绑定 settings 作用域句柄. */
  bindScope(scope) {
    this.scope = scope;
  }
  /** 作废引用缓存, 让下一次 `current()` 强制重读. */
  invalidate() {
    this.lastRaw = null;
  }
  /** 字段级叠加: 给出且类型合法的字段才覆盖, 其余保留现值. */
  sync(next) {
    if (next === null || next === void 0 || typeof next !== "object") return;
    this.lastRaw = next;
    Object.assign(this.live, coerceConfig(next, this.live));
    setDiagActive(this.live.enabled || this.live.autoContinue);
  }
};

// src/host/observation.ts
import { readFileSync } from "node:fs";
var RECENT_MAX = 50;
var LOG_TAIL_MAX = 500;
var Observer = class {
  startedAt = Date.now();
  retries = 0;
  continues = 0;
  capped = 0;
  skipped = 0;
  byCode = {};
  byProvider = {};
  recent = [];
  /** 一次请求失败被重试链路接管. */
  retry(entry) {
    this.retries += 1;
    bump(this.byCode, entry.code);
    bump(this.byProvider, entry.provider);
    this.push({
      t: Date.now(),
      kind: "retry",
      code: entry.code,
      provider: entry.provider,
      model: entry.model,
      ...entry.turn === void 0 ? {} : { turn: entry.turn },
      delayMs: entry.delayMs
    });
  }
  /** 一轮自动续写已投递. */
  continued(entry) {
    this.continues += 1;
    this.push({
      t: Date.now(),
      kind: "continue",
      turn: entry.turn,
      ...entry.provider === void 0 ? {} : { provider: entry.provider },
      ...entry.model === void 0 ? {} : { model: entry.model }
    });
  }
  /** 连续续写触顶. */
  hitCap(turn) {
    this.capped += 1;
    this.push({ t: Date.now(), kind: "cap", turn });
  }
  /** 让位给用户自己排的消息. */
  skippedByUser(turn) {
    this.skipped += 1;
    this.push({ t: Date.now(), kind: "skip", turn });
  }
  /** 只读快照. */
  snapshot() {
    return {
      startedAt: this.startedAt,
      retries: this.retries,
      continues: this.continues,
      capped: this.capped,
      skipped: this.skipped,
      byCode: { ...this.byCode },
      byProvider: { ...this.byProvider },
      recent: [...this.recent]
    };
  }
  push(entry) {
    this.recent.push(entry);
    while (this.recent.length > RECENT_MAX) this.recent.shift();
  }
};
function bump(bag, key) {
  if (key !== "") bag[key] = (bag[key] ?? 0) + 1;
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function installObservationRoutes(ctx, observer, sources) {
  ctx.inject(["connection"], (connectionCtx) => {
    try {
      const connection = connectionCtx.connection;
      const registry = connection?.fetch;
      if (registry === void 0 || typeof registry.register !== "function") {
        diag("connection.fetch \u4E0D\u53EF\u7528\uFF1A\u89C2\u6D4B\u8DEF\u7531\u672A\u6CE8\u518C\uFF08\u89C2\u6D4B\u9762\u677F\u5C06\u663E\u793A\u5360\u4F4D\uFF09");
        return;
      }
      registry.register({
        path: STATS_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: async () => {
          const config = sources.config();
          return jsonResponse({
            plugin: PACKAGE_NAME,
            diagTag: DIAG_TAG,
            pid: process.pid,
            now: Date.now(),
            config: {
              ...config,
              continuationPrompt: config.continuationPrompt.trim() === "" ? "(\u5185\u7F6E\u9ED8\u8BA4)" : "(\u81EA\u5B9A\u4E49)"
            },
            stats: observer.snapshot(),
            models: sources.models()
          });
        }
      });
      registry.register({
        path: LOG_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: async (request) => {
          const url = new URL(request.url);
          const asked = Number(url.searchParams.get("tail") ?? "80");
          const tail = Math.min(Math.max(Number.isFinite(asked) ? asked : 80, 1), LOG_TAIL_MAX);
          try {
            const lines = readFileSync(LOG_FILE, "utf8").split("\n");
            return jsonResponse({
              path: LOG_FILE,
              tail,
              lines: lines.slice(Math.max(0, lines.length - 1 - tail), lines.length - 1)
            });
          } catch (error) {
            return jsonResponse({ path: LOG_FILE, tail: 0, lines: [], error: String(error) });
          }
        }
      });
      diag(`\u89C2\u6D4B\u8DEF\u7531\u5DF2\u6CE8\u518C\uFF1A${STATS_PATH} / ${LOG_PATH}`);
    } catch (error) {
      diag(`\u89C2\u6D4B\u8DEF\u7531\u6CE8\u518C\u5931\u8D25\uFF1A${String(error)}`);
    }
  });
}

// src/host/policy.ts
var globCache = /* @__PURE__ */ new Map();
function globMatch(pattern2, value) {
  const normalized = (pattern2 ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "*") return true;
  const candidate = (value ?? "").toLowerCase();
  if (!normalized.includes("*")) return normalized === candidate;
  let pattern$ = globCache.get(normalized);
  if (pattern$ === void 0) {
    const escaped = normalized.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    pattern$ = new RegExp(`^${escaped}$`);
    if (globCache.size > 64) globCache.clear();
    globCache.set(normalized, pattern$);
  }
  return pattern$.test(candidate);
}
function matchOverride(rows, provider, model) {
  return rows.find((row) => {
    if (row === null || row === void 0) return false;
    const rowModel = (row.model ?? "").trim();
    if (!globMatch(row.provider, provider)) return false;
    if (rowModel === "" || rowModel === "*") return true;
    return model !== "" && globMatch(rowModel, model);
  });
}
function installRetryPolicy(ctx, live, models, observer) {
  ctx.on(
    "agent/request-error",
    (rawPayload, next) => {
      const payload = rawPayload;
      const config = live.current();
      const code = payload.code ?? payload.failure?.code ?? "";
      const provider = typeof payload.provider === "string" ? payload.provider : "";
      const sessionId = String(payload.agent?.session?.id ?? "");
      const model = models.modelOf(sessionId);
      const override = matchOverride(config.overrides, provider, model);
      const effective = {
        maxRetries: override && override.maxRetries >= 0 ? override.maxRetries : config.maxRetries,
        initialDelayMs: override && override.initialDelayMs >= 0 ? override.initialDelayMs : config.initialDelayMs,
        maxDelayMs: override && override.maxDelayMs >= 0 ? override.maxDelayMs : config.maxDelayMs,
        jitterRatio: override && override.jitterRatio >= 0 ? override.jitterRatio : config.jitterRatio
      };
      diag(
        `request-error enabled=${config.enabled} code=${code || "(n/a)"} provider=${provider || "(n/a)"} model=${model || "(n/a)"}${override ? ` override=${override.provider}/${override.model}` : ""}`
      );
      if (config.enabled) {
        observer.retry({
          code,
          provider,
          model,
          turn: payload.turn,
          delayMs: effective.initialDelayMs
        });
      }
      if (config.enabled && payload.retryPolicy !== void 0 && payload.retryPolicy !== null) {
        const policy = payload.retryPolicy;
        const mergedCodes = config.retryableCodes.length > 0 ? [.../* @__PURE__ */ new Set([...policy.retryableCodes ?? [], ...config.retryableCodes])] : policy.retryableCodes;
        payload.retryPolicy = {
          ...policy,
          ...policy.mode === "normal" ? { maxRetries: effective.maxRetries } : {},
          ...mergedCodes === void 0 ? {} : { retryableCodes: mergedCodes },
          initialDelayMs: effective.initialDelayMs,
          maxDelayMs: effective.maxDelayMs,
          jitterRatio: effective.jitterRatio
        };
      }
      return next();
    },
    { prepend: true }
  );
}

// src/host/session-models.ts
var STATE_MAX2 = 200;
var SessionModels = class {
  entries = /* @__PURE__ */ new Map();
  /** 记住一个会话最近一次请求的 provider / model. */
  remember(sessionId, provider, model) {
    this.entries.set(sessionId, { provider, model });
    while (this.entries.size > STATE_MAX2) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
    }
  }
  /** 该会话最近一次请求的模型名; 不知道时是空串. */
  modelOf(sessionId) {
    return this.entries.get(sessionId)?.model ?? "";
  }
  /** 该会话最近一次请求的 provider / model. */
  of(sessionId) {
    return this.entries.get(sessionId);
  }
  /** 会话离场即清, 避免长跑进程里无界增长. */
  forget(sessionId) {
    this.entries.delete(sessionId);
  }
  /** 只读快照 (观测路由用). */
  snapshot() {
    return Object.fromEntries(this.entries);
  }
};

// src/host/settings.ts
function installSettings(ctx, live, config) {
  ctx.inject(["settings"], (sctx) => {
    try {
      const settings = sctx.settings;
      if (settings === void 0 || typeof settings.configure !== "function") {
        diag("settings \u670D\u52A1\u7F3A\u5C11 configure\uFF0C\u8DF3\u8FC7\u8868\u5355\u58F0\u660E");
        return;
      }
      try {
        sctx.effect(
          () => settings.configure({ auto: false }, ctx.fiber),
          "dsh-llm-retry-settings: settings presentation"
        );
      } catch (error) {
        diag(`settings.configure \u5931\u8D25\uFF08\u53EF\u80FD\u5DF2\u914D\u7F6E\u8FC7\u540C\u4E00 fiber\uFF09\uFF1A${String(error)}`);
      }
      live.bindScope({ get: () => config });
      live.invalidate();
      live.sync(config);
      sctx.on("loader/volatile-update", () => {
        live.invalidate();
        live.sync(config);
        const now = live.value;
        diag(
          `settings sync(volatile): autoContinue=${now.autoContinue} maxContinuations=${now.maxContinuations} enabled=${now.enabled}`
        );
      });
      diag(`settings presentation configured (ns=${ENTRY_ID}) ${summaryOf(live.value)}`);
    } catch (error) {
      diag(`settings \u6CE8\u518C\u5931\u8D25\uFF1A${String(error)}`);
      ctx.logger.warn("[dsh-llm-retry-settings] settings \u6CE8\u518C\u5931\u8D25", error);
    }
  });
}

// src/index.ts
var name = "dsh-llm-retry-settings";
var inject = ["settings", "agents", "sessions"];
function apply(ctx, config) {
  const live = new LiveConfig(config);
  const models = new SessionModels();
  const observer = new Observer();
  diag(`activate ${DIAG_TAG} pid=${process.pid} inject=[${inject.join(",")}] ${summaryOf(live.value)}`);
  installSettings(ctx, live, config);
  installRetryPolicy(ctx, live, models, observer);
  new AutoContinue(ctx, live, models, observer).install();
  installObservationRoutes(ctx, observer, {
    config: () => live.current(),
    models: () => models.snapshot()
  });
}
export {
  Config,
  DEFAULTS,
  apply,
  inject,
  name
};
