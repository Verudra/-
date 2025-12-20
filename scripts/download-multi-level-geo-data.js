#!/usr/bin/env node
/**
 * 下载中国省市区县三级地图数据
 * 从阿里云DataV获取完整的GeoJSON数据，支持层级显示
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');

const DATA_DIR = path.join(__dirname, '../data/geo');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 中国省份代码列表
const PROVINCE_CODES = [
  '110000', // 北京市
  '120000', // 天津市
  '130000', // 河北省
  '140000', // 山西省
  '150000', // 内蒙古自治区
  '210000', // 辽宁省
  '220000', // 吉林省
  '230000', // 黑龙江省
  '310000', // 上海市
  '320000', // 江苏省
  '330000', // 浙江省
  '340000', // 安徽省
  '350000', // 福建省
  '360000', // 江西省
  '370000', // 山东省
  '410000', // 河南省
  '420000', // 湖北省
  '430000', // 湖南省
  '440000', // 广东省
  '450000', // 广西壮族自治区
  '460000', // 海南省
  '500000', // 重庆市
  '510000', // 四川省
  '520000', // 贵州省
  '530000', // 云南省
  '540000', // 西藏自治区
  '610000', // 陕西省
  '620000', // 甘肃省
  '630000', // 青海省
  '640000', // 宁夏回族自治区
  '650000', // 新疆维吾尔自治区
  '710000', // 台湾省
  '810000', // 香港特别行政区
  '820000'  // 澳门特别行政区
];

// 延迟函数
const sleep = promisify(setTimeout);

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 下载: ${url}`);

    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✅ 保存完成: ${filePath}`);
        resolve();
      });

    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // 删除部分下载的文件
      reject(err);
    });
  });
}

// 获取省份下的城市代码
async function getCitiesOfProvince(provinceCode) {
  try {
    const url = `https://geo.datav.aliyun.com/areas_v3/bound/${provinceCode}_full.json`;
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
      }).on('error', reject);
    });

    return response.features
      .filter(feature => feature.properties.level === 'city')
      .map(feature => feature.properties.adcode);
  } catch (error) {
    console.warn(`⚠️  获取省份 ${provinceCode} 的城市列表失败:`, error.message);
    return [];
  }
}

async function downloadMultiLevelGeoData() {
  try {
    console.log('🗺️  开始下载中国多级地图数据...');

    // 1. 下载省级完整地图（作为默认显示）
    console.log('\n📍 1/3 下载省级地图数据...');
    await downloadFile(
      'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
      path.join(DATA_DIR, 'china-province.json')
    );

    // 2. 下载各省市级地图
    console.log('\n🏙️  2/3 下载省级地图数据...');
    const provincesDir = path.join(DATA_DIR, 'provinces');
    if (!fs.existsSync(provincesDir)) {
      fs.mkdirSync(provincesDir, { recursive: true });
    }

    let totalProvinces = 0;
    let totalCities = 0;
    let totalDistricts = 0;

    for (const provinceCode of PROVINCE_CODES) {
      try {
        console.log(`\n📄 处理省份: ${provinceCode}`);

        // 下载省级地图（包含市级行政区）
        const provinceFile = path.join(provincesDir, `${provinceCode}_full.json`);
        await downloadFile(
          `https://geo.datav.aliyun.com/areas_v3/bound/${provinceCode}_full.json`,
          provinceFile
        );
        totalProvinces++;

        // 获取该省的城市代码
        const cityCodes = await getCitiesOfProvince(provinceCode);
        console.log(`   发现 ${cityCodes.length} 个城市`);

        // 延迟避免请求过频
        await sleep(100);

        // 3. 下载各城市县级地图
        console.log('\n🏘️  3/3 下载城市级地图数据...');
        const citiesDir = path.join(DATA_DIR, 'cities');
        if (!fs.existsSync(citiesDir)) {
          fs.mkdirSync(citiesDir, { recursive: true });
        }

        for (const cityCode of cityCodes) {
          try {
            const cityFile = path.join(citiesDir, `${cityCode}_full.json`);
            await downloadFile(
              `https://geo.datav.aliyun.com/areas_v3/bound/${cityCode}_full.json`,
              cityFile
            );
            totalCities++;

            // 检查该城市是否有下级区县
            const cityData = JSON.parse(fs.readFileSync(cityFile, 'utf8'));
            const districtCount = cityData.features.filter(f =>
              f.properties.level === 'district' || f.properties.level === 'county'
            ).length;
            totalDistricts += districtCount;

            // 延迟避免请求过频
            await sleep(50);
          } catch (error) {
            console.warn(`   ⚠️  下载城市 ${cityCode} 失败:`, error.message);
          }
        }

        // 省间延迟
        await sleep(200);

      } catch (error) {
        console.warn(`⚠️  下载省份 ${provinceCode} 失败:`, error.message);
      }
    }

    // 创建索引文件
    const indexData = {
      type: 'multi-level-geo-data',
      version: '1.0.0',
      source: 'aliyun-datav',
      lastUpdated: new Date().toISOString(),
      summary: {
        provinces: totalProvinces,
        cities: totalCities,
        districts: totalDistricts
      },
      files: {
        china: 'china-province.json',
        provinces: 'provinces/',
        cities: 'cities/'
      }
    };

    fs.writeFileSync(
      path.join(DATA_DIR, 'index.json'),
      JSON.stringify(indexData, null, 2)
    );

    console.log('\n🎉 地图数据下载完成！');
    console.log(`📊 下载统计:`);
    console.log(`   省级行政区: ${totalProvinces} 个`);
    console.log(`   市级行政区: ${totalCities} 个`);
    console.log(`   县级行政区: ${totalDistricts} 个`);
    console.log(`📁 数据目录: ${DATA_DIR}`);
    console.log(`📄 索引文件: ${path.join(DATA_DIR, 'index.json')}`);

  } catch (error) {
    console.error('❌ 下载失败:', error.message);
    process.exit(1);
  }
}

// 执行下载
downloadMultiLevelGeoData();