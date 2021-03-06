/*!
 * elasticsearch-mapper
 * Copyright(c) 2016 Mustapha Babatunde Oluwaleke
 * MIT Licensed
 */

'use strict';


/*
 *  Dependencies
 * */
var _ = require('lodash'),
  inspector = require('util'),
  mappers = require('./helpers/mappers'),
  defaultConfig = require('./config/default-settings');



/*
* Private variables
* */
var Mapper = {};
Mapper.Indices = {};
Mapper.defaultConfig = _.cloneDeep(defaultConfig);
Mapper.keyLog = {};



/**
 * Add filters and analyzers to Mapper
 *
 * @method configure
 * @param {Object} configObject - object containing analyzers and filters
 */
var configure = function (configObject) {
  var filters = configObject.filters;
  var analyzers = configObject.analyzers;

  if (filters) {
    var filterNames = Object.keys(filters);
    _.each(filterNames, function (filterName) {
      if (!Mapper.defaultConfig.analysis.filter.hasOwnProperty(filterName)) {
        Mapper.defaultConfig.analysis.filter[filterName] = filters[filterName];
      }
    });
  }

  if (analyzers) {
    var analyzerNames = Object.keys(analyzers);
    _.each(analyzerNames, function (analyzerName) {
      if (!Mapper.defaultConfig.analysis.analyzer.hasOwnProperty(analyzerName)) {
        Mapper.defaultConfig.analysis.analyzer[analyzerName] = analyzers[analyzerName];
      }
    });
  }

};



/**
 * Returns default config
 *
 * @method getDefaultConfig
 * @return {Object} configuration object
 */
var getDefaultConfig = function () {
  return Mapper.defaultConfig;
};



/**
 * Sets if dynamic mapping is enabled or disabled in the specified index
 *
 * @method dynamicMapping
 * @param {String} indexName - name of index to enable or disable dynamic mapping for
 * @param {boolean} status - dynamic mapping status
 */
var dynamicMapping = function (indexName, status) {

  var index = getIndex(indexName);

  // check if index is registered
  if (!index) {
    throw new Error('Elastic Mapper - Index not found');
  }

  // check if index level dynamic mapping is allowed on index
  if (!index.settings.hasOwnProperty('index.mapper.dynamic')) {
    throw new Error('Elastic Mapper - Index level dynamic mapping is disabled in index. Enable index level dynamic mappings or use type level dynamic mappings');
  }

  index.settings['index.mapper.dynamic'] = status;
  // change dynamic mappings status for all mappings in specified index
  var mappings = index.mappings;
  var mappingKeys = Object.keys(mappings);
  _.each(mappingKeys, function (key) {
    mappings[key].dynamic = status ? 'true' : 'false';
  });
};



/**
 * Sets dynamic mappings for type in specified index. This only works if index level dynamic mappings has been disabled
 *
 * @method typeDynamicMapping
 * @param {String} indexName - name of index to get type mappings from
 * @param {String} type - name of type to set dynamic mappings for
 * @param {boolean} status - dynamic mappings status
 */
var typeDynamicMapping = function (indexName, type, status) {
  var index = getIndex(indexName);

  // check if index is registered
  if (!index) {
    throw new Error('Elastic Mapper - Index not found');
  }

  // check if index level dynamic mappings is enabled
  if (index.settings.hasOwnProperty('index.mapper.dynamic')) {
    throw new Error('Elastic Mapper - Index level dynamic mappings is active. Disable and try again');
  }

  // check if type is registered under index
  if (!index.mappings[type]) {
    throw new Error('Elastic Mapper - Type not found');
  }

  index.mappings[type].dynamic = String(!!status);
};



/**
 * Enables index level dynamic mappings for index.
 * This ensures that dynamic mapping for all types registered under index can be altered using the dynamicMapping method
 *
 * @method enableIndexLevelDynamicMappings
 * @param {String} indexName - name of index to enabled index level dynamic mappings for
 * @param {boolean} status - optional status (defaults to false it not provided)
 */
var enableIndexLevelDynamicMappings = function (indexName, status) {
  var index = getIndex(indexName);

  // check if index is registered
  if (!index) {
    throw new Error('Elastic Mapper - Index not found');
  }

  if (!index.settings.hasOwnProperty('index.mapper.dynamic')) {
    index.settings['index.mapper.dynamic'] = !!status;
  }
};



/**
 * Disables index level dynamic mappings for index. This will make all dynamic mappings configuration to be done only on type level.
 *
 * @method disableIndexLevelDynamicMappings
 * @param {String} indexName - name of index to disable index level dynamic mappings for
 */
var disableIndexLevelDynamicMappings = function (indexName) {
  var index = getIndex(indexName);

  // check if index is registered
  if (!index) {
    throw new Error('Elastic Mapper - Index not found');
  }

  if (index.settings.hasOwnProperty('index.mapper.dynamic')) {
    delete index.settings['index.mapper.dynamic'];
  }
};



/**
 * Resets mapper module to clean state
 *
 * @method clear
 */
var clear = function () {
  Mapper = {};
  Mapper.Indices = {};
  Mapper.defaultConfig = _.cloneDeep(defaultConfig);
  Mapper.keyLog = {};
};



/**
 * Add an index to the mapper
 *
* @method index
* @param {String} indexName - name of index to register
*/
var index = function (indexName) {
  if (!indexName || typeof indexName !== 'string') {
    throw new Error('Elastic Mapper - Invalid index name');
  }
  Mapper.Indices[indexName] = {
    settings: Mapper.defaultConfig,
    mappings: {}
  };
};



/**
 * Retrieve an already registered index
 *
 * @method getIndex
 * @param {String} indexName - name of index to retrieve
 * @return {Object} index object matching the specified name, undefined if no matching index is found
 */
var getIndex = function (indexName) {
  return Mapper.Indices[indexName];
};



/**
 * Create a type and attach mapping object (generated from specified JSON document and config)
 *
 * @method mapFromDoc
 * @param {String} indexName - name of index to create type and mapping for
 * @param {String} typeName - name of type to create and attach mapping to
 * @param {Object} document - document to use for mapping generation
 * @param {Array} config - array containing mapping fields settings (if empty, all string fields will be indexed and searchable)
 * @return {Object} mapping
 */
var mapFromDoc = function (indexName, typeName, document, config) {

  // if index is has not been registered beforehand, create it dynamically
  if (!getIndex(indexName)) {
    index(indexName);
  }

  var mapping = mappers.createMappingsFromJSON(document, Mapper.Indices[indexName].settings, config, indexName, Mapper.keyLog);
  Mapper.Indices[indexName].mappings[typeName] = mapping;
  return mapping;
};



/**
 * Create a type and attach mapping object (generated from specified mongoDB collection)
 *
 * @method mapFromCollection
 * @param {String} indexName - name of index to create type and mapping for
 * @param {String} typeName - name of type to create and attach mapping to
 * @param {Object} dbConfig - object containing mongoUrl, collectionName and configArray to use for mapping generation
 * @param {Function} callBack - array containing mapping fields settings (if empty, all string fields will be indexed and searchable)
 */
var mapFromCollection = function (indexName, typeName, dbConfig, callBack) {

  // if index is has not been registered beforehand, create it dynamically
  if (!getIndex(indexName)) {
    index(indexName);
  }

  mappers.createMappingsFromCollection({
    settings: Mapper.Indices[indexName].settings,
    config: dbConfig,
    indexName: indexName,
    log: Mapper.keyLog
  }, function (mapping) {
    Mapper.Indices[indexName].mappings[typeName] = mapping;
    callBack(mapping);
  });
};



/**
 * returns number of indices registered
 *
 * @method indexCount
 */
var indexCount = function () {
  return Object.keys(Mapper.Indices).length;
};



/**
 * Returns all mappings registered under specified index
 *
 * @method getMappings
 * @param {String} indexName - name of index to retrieve mappings from
 * @return {Object} mappings objects
 */
var getMappings = function (indexName) {
  var index = getIndex(indexName);

  // check if index is registered
  if (!index) {
    throw new Error('Elastic Mapper - Index not found');
  }

  return index.mappings;
};



/**
 * Returns single mapping from specified index
 *
 * @method getSingleMapping
 * @param {String} indexName - name of index to retrieve mapping from
 * @param {String} mappingName - name of mapping to retrieve
 * @return {Object} mapping object
 */
var getSingleMapping = function (indexName, mappingName) {
  return getMappings(indexName)[mappingName];
};



module.exports = {
  clear: clear,
  configure: configure,
  getDefaultConfig: getDefaultConfig,
  enableIndexLevelDynamicMappings: enableIndexLevelDynamicMappings,
  disableIndexLevelDynamicMappings: disableIndexLevelDynamicMappings,
  dynamicMapping: dynamicMapping,
  typeDynamicMapping: typeDynamicMapping,
  index:  index,
  getIndex: getIndex,
  mapFromDoc: mapFromDoc,
  mapFromCollection: mapFromCollection,
  indexCount: indexCount,
  getMappings: getMappings,
  getSingleMapping: getSingleMapping
};


