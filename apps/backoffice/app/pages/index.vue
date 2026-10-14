<script setup lang="ts">
const { data } = await useFetch('/api/admin/products')
</script>

<template>
  <ul>
    <li v-for="product in data?.results" :key="product.id">
      {{ product.name }} <span v-if="!product.isActive">(inactive)</span>
    </li>
  </ul>
</template>
