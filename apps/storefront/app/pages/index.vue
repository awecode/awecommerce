<script setup lang="ts">
const { data } = await useFetch('/api/store/products')
</script>

<template>
  <ul>
    <li v-for="product in data?.results" :key="product.id">
      {{ product.name }}
    </li>
  </ul>
</template>
