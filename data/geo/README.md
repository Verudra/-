# Geo 数据说明

本项目要做到“精确到县/区”的点亮与地图细化，需要一份包含县/区边界的 GeoJSON。

## 放置位置

- 将县/区级 GeoJSON 放到：`data/geo/china-county.json`

后端会按如下顺序加载地图数据：
1. `data/geo/china-county.json`（县/区级，优先）
2. `frontend/vendor/echarts/map/json/china.json`（省级，兜底）

## GeoJSON 要求（建议）

- `type: "FeatureCollection"`
- 每个 `feature.properties` 至少包含：
  - `name`：地区名称（例如：南山区）
  - `adcode`：行政区划代码（字符串或数字均可）
  - `level`：`province` / `city` / `district` / `county`（任意其一即可）
  - `centroid` 或 `center`：用于在地图上打点的经纬度数组 `[lng, lat]`
  - `acroutes`（可选）：上级行政区 adcode 链，用于提高“输入全名”匹配准确度

> 说明：如果没有县级 GeoJSON，项目仍可运行，但只能做到省级边界展示（不满足“地图细化到县”的效果）。
